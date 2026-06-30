// 無需任何外部依賴，直接部署到 Cloudflare Workers
// 所有時間均為台灣時間 (UTC+8)

// ========== 環境變數（請在 wrangler.toml 設定） ==========
// HR_EMPLOYEE_NO, CHAIRMAN_NO

function getHrNo(env) {
  return env.HR_EMPLOYEE_NO || 'HR001'
}

function getChairmanNo(env) {
  return env.CHAIRMAN_NO || '10000001'
}

// ========== 輔助函式 ==========
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': '*'
    }
  })
}

function getTaiwanTimeString() {
  const now = new Date()
  const taiwanTime = new Date(now.getTime() + (8 * 60 * 60 * 1000))
  return taiwanTime.toISOString().replace('T', ' ').slice(0, 19)
}

function timeToMinutesForWorker(time) {
  const parts = String(time || '').split(':')
  if (parts.length !== 2) return 0
  const hour = Number(parts[0])
  const minute = Number(parts[1])
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 0
  return hour * 60 + minute
}

function calculateSimpleHoursForWorker(startTime, endTime) {
  const start = timeToMinutesForWorker(startTime)
  const end = timeToMinutesForWorker(endTime)
  return Math.max(0, end - start) / 60
}

// 国定假日列表（2026-2027年）
const nationalHolidays = [
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-27', '2026-04-03', '2026-04-06', '2026-06-19',
  '2026-09-25', '2026-10-09',
  '2027-01-01', '2027-02-04', '2027-02-05', '2027-02-06', '2027-02-08',
  '2027-02-09', '2027-03-01', '2027-04-05', '2027-04-06', '2027-06-09',
  '2027-09-15', '2027-10-11'
];

function isHoliday(dateStr) {
  return nationalHolidays.includes(dateStr)
}

function isWeekend(date) {
  const day = date.getDay()
  return day === 0 || day === 6
}

// 時區修正：使用 T00:00:00+08:00 避免 UTC 解析導致星期偏移
function countExpectedWorkDays(startDateStr, endDateStr) {
  let count = 0
  const current = new Date(startDateStr + 'T00:00:00+08:00')
  const end = new Date(endDateStr + 'T00:00:00+08:00')
  while (current <= end) {
    const year = current.getFullYear()
    const month = String(current.getMonth() + 1).padStart(2, '0')
    const day = String(current.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`
    if (!isWeekend(current) && !isHoliday(dateStr)) {
      count++
    }
    current.setDate(current.getDate() + 1)
  }
  return count
}

function determineOvertimeType(dateString) {
  if (nationalHolidays.includes(dateString)) return 'national_holiday'
  const date = new Date(`${dateString}T00:00:00+08:00`)
  const day = date.getDay()
  if (day === 0 || day === 6) return 'weekend'
  return 'weekday'
}

async function getEmployee(db, employeeNo) {
  if (!employeeNo) return null
  const stmt = await db.prepare(`
    SELECT
      employee_no, employee_name, department_name, position_title, rank_type,
      direct_manager_no, direct_manager_name,
      first_proxy_no, first_proxy_name, second_proxy_no, second_proxy_name, is_active
    FROM employees
    WHERE employee_no = ? AND is_active = 1
  `).bind(employeeNo)
  return await stmt.first()
}

async function getEmployeeName(db, employeeNo) {
  const emp = await getEmployee(db, employeeNo)
  return emp?.employee_name || ''
}

function determineSystemRole(employeeNo, rankType, positionTitle, hrNo) {
  if (employeeNo === hrNo || rankType === 'HR' || rankType === '人資') return 'hr'
  if (rankType === '董事長') return 'general_manager'
  if (
    String(positionTitle || '').includes('主管') ||
    String(positionTitle || '').includes('經理') ||
    String(positionTitle || '').includes('主任')
  ) return 'manager'
  return 'employee'
}

async function isHr(env, employeeNo) {
  if (!employeeNo) return false
  const user = await getEmployee(env.DB, employeeNo)
  if (!user) return false
  const role = determineSystemRole(employeeNo, user.rank_type, user.position_title, getHrNo(env))
  return role === 'hr'
}

// ========== 請假流程 ==========
async function getNextLeaveApprover(env, db, employeeNo, currentStage, totalHours) {
  const applicant = await getEmployee(db, employeeNo)
  if (!applicant) return null
  const stages = ['hr', 'proxy', 'manager', 'chairman']
  const currentIndex = stages.indexOf(currentStage)
  if (currentIndex === -1) return null
  for (let i = currentIndex + 1; i < stages.length; i++) {
    const stage = stages[i]
    if (stage === 'proxy') {
      if (applicant.first_proxy_no || applicant.second_proxy_no) {
        return { no: 'PROXY', name: '代理人審核', stage: 'proxy' }
      }
      continue
    }
    if (stage === 'manager') {
      if (applicant.direct_manager_no) {
        const managerNo = applicant.direct_manager_no.trim().toUpperCase()
        const managerName = applicant.direct_manager_name || await getEmployeeName(db, managerNo)
        return { no: managerNo, name: managerName, stage: 'manager' }
      }
      continue
    }
    if (stage === 'chairman') {
      if (totalHours > 24) {
        const chairmanNo = getChairmanNo(env)
        if (chairmanNo) {
          const chairmanName = await getEmployeeName(db, chairmanNo)
          return { no: chairmanNo, name: chairmanName, stage: 'chairman' }
        }
      }
      return null
    }
  }
  return null
}

async function getNextPunchOvertimeApprover(db, employeeNo, currentStage) {
  if (currentStage === 'hr') {
    const applicant = await getEmployee(db, employeeNo)
    if (applicant && applicant.direct_manager_no) {
      const managerNo = applicant.direct_manager_no.trim().toUpperCase()
      const managerName = applicant.direct_manager_name || await getEmployeeName(db, managerNo)
      return { no: managerNo, name: managerName, stage: 'manager' }
    }
    return null
  }
  return null
}

// ========== 出勤狀態重算與補卡/請假寫回函式 ==========

// ===== 修改點 1：recomputePunchFixStatus 中的 late_grace 條件 =====
// 原為 > '08:00:00'，改為 > '08:00:59'
function recomputePunchFixStatus(firstPunchTime, lastPunchTime) {
  if (!firstPunchTime && !lastPunchTime) return 'normal'
  if (firstPunchTime && firstPunchTime > '08:10:59' && lastPunchTime && lastPunchTime < '17:00:00') return 'late_and_early_leave'
  if (firstPunchTime && firstPunchTime > '08:10:59') return 'late'
  if (firstPunchTime && firstPunchTime > '08:00:59') return 'late_grace'   // 修改這裡
  if (lastPunchTime && lastPunchTime < '17:00:00') return 'early_leave'
  return 'normal'
}

async function applyApprovedPunchToAttendance(db, punch, now) {
  const employeeNo = punch.employee_no
  const workDate = punch.punch_date
  const punchTime = punch.punch_time
  const punchType = punch.punch_type

  const existing = await db.prepare(`
    SELECT * FROM attendance_daily WHERE employee_no = ? AND work_date = ?
  `).bind(employeeNo, workDate).first()

  let firstPunchTime = existing?.first_punch_time || null
  let lastPunchTime = existing?.last_punch_time || null

  // 依補卡類型決定要更新上班或下班時間（上下班補卡兩者都更新）
  if (punchType.includes('上班') || punchType.includes('Clock-in') || punchType.includes('giờ vào')) {
    if (!firstPunchTime || punchTime < firstPunchTime) firstPunchTime = punchTime
  }
  if (punchType.includes('下班') || punchType.includes('Clock-out') || punchType.includes('giờ ra')) {
    if (!lastPunchTime || punchTime > lastPunchTime) lastPunchTime = punchTime
  }
  if (punchType.includes('上下班') || punchType.includes('Both') || punchType.includes('cả vào và ra')) {
    if (!firstPunchTime || punchTime < firstPunchTime) firstPunchTime = punchTime
    if (!lastPunchTime || punchTime > lastPunchTime) lastPunchTime = punchTime
  }
  if (punchType.includes('外出返廠') || punchType.includes('Field Return') || punchType.includes('công tác')) {
    if (!lastPunchTime || punchTime > lastPunchTime) lastPunchTime = punchTime
  }

  const newStatus = recomputePunchFixStatus(firstPunchTime, lastPunchTime)

  if (existing) {
    await db.prepare(`
      UPDATE attendance_daily
      SET first_punch_time = ?, last_punch_time = ?, punch_fix_status = ?,
          status_note = '補卡核准更新', updated_at = ?
      WHERE id = ?
    `).bind(firstPunchTime, lastPunchTime, newStatus, now, existing.id).run()
  } else {
    await db.prepare(`
      INSERT INTO attendance_daily (employee_no, employee_name, work_date, first_punch_time, last_punch_time, punch_fix_status, status_note, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, '補卡核准新增', ?)
    `).bind(employeeNo, punch.employee_name, workDate, firstPunchTime, lastPunchTime, newStatus, now).run()
  }

  // 若該日異常已存在，標記為已處理（補卡已解決異常）
  await db.prepare(`
    UPDATE attendance_exceptions
    SET status = 'resolved', reason_text = COALESCE(reason_text, '補卡已核准'), updated_at = ?
    WHERE employee_no = ? AND work_date = ? AND status IN ('pending', 'need_reason')
  `).bind(now, employeeNo, workDate).run()
}

async function applyApprovedLeaveToAttendance(db, leave, now) {
  const employeeNo = leave.employee_no
  const employeeName = leave.employee_name
  const startDate = leave.start_date
  const startTime = leave.start_time || '08:00'
  const endDate = leave.end_date
  const endTime = leave.end_time || '17:00'

  const workStart = timeToMinutesForWorker('08:00')
  const workEnd = timeToMinutesForWorker('17:00')
  const lunchStart = timeToMinutesForWorker('12:00')
  const lunchEnd = timeToMinutesForWorker('13:00')

  const current = new Date(startDate + 'T00:00:00+08:00')
  const end = new Date(endDate + 'T00:00:00+08:00')

  while (current <= end) {
    const year = current.getFullYear()
    const month = String(current.getMonth() + 1).padStart(2, '0')
    const day = String(current.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`

    if (!isWeekend(current) && !isHoliday(dateStr)) {
      let dayStart = workStart
      let dayEnd = workEnd
      if (dateStr === startDate) dayStart = Math.max(dayStart, timeToMinutesForWorker(startTime))
      if (dateStr === endDate) dayEnd = Math.min(dayEnd, timeToMinutesForWorker(endTime))
      let workMinutes = Math.max(0, dayEnd - dayStart)
      const lunchOverlap = Math.max(0, Math.min(dayEnd, lunchEnd) - Math.max(dayStart, lunchStart))
      workMinutes -= lunchOverlap
      const dayHours = Math.max(0, workMinutes) / 60

      if (dayHours > 0) {
        const existing = await db.prepare(`
          SELECT * FROM attendance_daily WHERE employee_no = ? AND work_date = ?
        `).bind(employeeNo, dateStr).first()

        if (existing) {
          const newLeaveHours = (existing.leave_hours || 0) + dayHours
          await db.prepare(`
            UPDATE attendance_daily
            SET leave_hours = ?, punch_fix_status = 'normal', status_note = '請假核准更新', updated_at = ?
            WHERE id = ?
          `).bind(newLeaveHours, now, existing.id).run()
        } else {
          await db.prepare(`
            INSERT INTO attendance_daily (employee_no, employee_name, work_date, leave_hours, punch_fix_status, status_note, updated_at)
            VALUES (?, ?, ?, ?, 'normal', '請假核准新增', ?)
          `).bind(employeeNo, employeeName, dateStr, dayHours, now).run()
        }

        // 請假當天視為正常出勤，撤銷異常紀錄
        await db.prepare(`
          UPDATE attendance_exceptions
          SET status = 'resolved', reason_text = COALESCE(reason_text, '已核准請假'), updated_at = ?
          WHERE employee_no = ? AND work_date = ? AND status IN ('pending', 'need_reason')
        `).bind(now, employeeNo, dateStr).run()
      }
    }
    current.setDate(current.getDate() + 1)
  }
}

// ========== 輔助函式：計算月份週期（上月26日至本月25日） ==========
function getMonthPeriod(monthStr) {
  if (!monthStr) {
    const now = new Date()
    const taiwanDate = new Date(now.getTime() + (8 * 60 * 60 * 1000))
    const year = taiwanDate.getFullYear()
    const month = taiwanDate.getMonth() + 1
    monthStr = `${year}-${String(month).padStart(2, '0')}`
  }
  const [year, month] = monthStr.split('-').map(Number)
  let startYear = year
  let startMonth = month - 1
  if (startMonth === 0) {
    startMonth = 12
    startYear = year - 1
  }
  const startDate = `${startYear}-${String(startMonth).padStart(2, '0')}-26`
  const endDate = `${year}-${String(month).padStart(2, '0')}-25`
  return { startDate, endDate, monthStr }
}

// ========== 週年制年度區間計算（以到職滿六個月之月日為基準，每年固定） ==========
// ===== 修改點 2：getAnniversaryYearPeriod 改為以到職滿六個月的月日為錨點 =====
function getAnniversaryYearPeriod(hireDateStr, today) {
  const hireDate = new Date(hireDateStr + 'T00:00:00+08:00')

  // 計算到職滿六個月的日期，取其月、日作為每年週期的固定起點
  const sixMonthDate = new Date(hireDate)
  sixMonthDate.setMonth(sixMonthDate.getMonth() + 6)
  const anchorMonth = sixMonthDate.getMonth()
  const anchorDay = sixMonthDate.getDate()

  let periodStartYear = today.getFullYear()
  let periodStart = new Date(periodStartYear, anchorMonth, anchorDay)
  if (periodStart > today) {
    periodStartYear -= 1
    periodStart = new Date(periodStartYear, anchorMonth, anchorDay)
  }

  // 保護：第一個週期起點不得早於「到職滿六個月」當天，避免顯示出到職前就開始的週期
  if (periodStart < sixMonthDate) {
    periodStart = new Date(sixMonthDate)
  }

  const periodEnd = new Date(periodStart.getFullYear() + 1, anchorMonth, anchorDay)
  periodEnd.setDate(periodEnd.getDate() - 1)

  function fmt(d) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  return { startDate: fmt(periodStart), endDate: fmt(periodEnd) }
}

// ========== 路由處理 ==========
async function handleRequest(request, env) {
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': '*'
      }
    })
  }

  // ----- 登入 (新增 gender 回傳) -----
  if (method === 'POST' && path === '/api/auth/login') {
    const body = await request.json()
    const employeeNo = String(body.employee_no || '').trim().toUpperCase()
    const pinCode = String(body.pin_code || '').trim()
    if (!employeeNo || !pinCode) {
      return jsonResponse({ ok: false, message: '請輸入員工編號與 PIN Code' }, 400)
    }
    const stmt = await env.DB.prepare(`
      SELECT employee_no, employee_name, department_name, position_title, rank_type,
             direct_manager_no, direct_manager_name, pin_code, gender, is_active
      FROM employees
      WHERE employee_no = ? AND pin_code = ? AND is_active = 1
    `).bind(employeeNo, pinCode)
    const user = await stmt.first()
    if (!user) {
      return jsonResponse({ ok: false, message: '員工編號或 PIN Code 錯誤' }, 401)
    }
    const hrNo = getHrNo(env)
    const systemRole = determineSystemRole(employeeNo, user.rank_type, user.position_title, hrNo)
    return jsonResponse({
      ok: true,
      user: {
        employee_no: user.employee_no,
        employee_name: user.employee_name,
        department_name: user.department_name,
        position_title: user.position_title,
        rank_type: user.rank_type,
        direct_manager_no: user.direct_manager_no,
        direct_manager_name: user.direct_manager_name,
        gender: user.gender,
        is_active: user.is_active,
        system_role: systemRole
      }
    })
  }

  // ----- 員工列表（加入 gender）-----
  if (method === 'GET' && path === '/api/employees') {
    const result = await env.DB.prepare(`
      SELECT employee_no, employee_name, department_name, position_title, rank_type,
             direct_manager_no, direct_manager_name, gender, is_active
      FROM employees WHERE is_active = 1 ORDER BY employee_no ASC
    `).all()
    return jsonResponse({ ok: true, employees: result.results || [] })
  }

  // ----- 假別列表 -----
  if (method === 'GET' && path === '/api/leave/types') {
    const result = await env.DB.prepare(`
      SELECT code, name_zh, name_en, name_vi, min_unit, min_hours, description_zh, has_expiry, gender_limit, sort_order
      FROM leave_types WHERE is_active = 1 ORDER BY sort_order ASC
    `).all()
    return jsonResponse({ ok: true, leave_types: result.results || [] })
  }

  // ========== 特別休假餘額查詢（到職日週年制） ==========
  if (method === 'GET' && path === '/api/leave/annual-balance') {
    const employeeNo = String(url.searchParams.get('employee_no') || '').trim().toUpperCase()
    if (!employeeNo) return jsonResponse({ ok: false, message: '缺少 employee_no' }, 400)

    const emp = await env.DB.prepare(`
      SELECT employee_no, employee_name, hire_date FROM employees WHERE employee_no = ? AND is_active = 1
    `).bind(employeeNo).first()
    if (!emp) return jsonResponse({ ok: false, message: '查無此員工' }, 404)
    if (!emp.hire_date) return jsonResponse({ ok: false, message: '此員工尚未設定到職日，無法計算特休', annual_days: 0, used_hours: 0, used_days: 0, remaining_days: 0 })

    const hireDate = new Date(emp.hire_date + 'T00:00:00+08:00')
    const today = new Date()

    const monthsWorked = (today.getFullYear() - hireDate.getFullYear()) * 12
      + (today.getMonth() - hireDate.getMonth())
      + (today.getDate() >= hireDate.getDate() ? 0 : -1)

    function calcAnnualLeaveDays(months) {
      if (months < 6) return 0
      if (months < 12) return 3
      if (months < 24) return 7
      const years = Math.floor(months / 12)
      if (years < 3) return 7
      if (years < 5) return 10
      if (years < 10) return 14
      if (years < 11) return 15
      return Math.min(15 + (years - 10), 30)
    }

    const annualDays = calcAnnualLeaveDays(monthsWorked)

    // 使用新的 getAnniversaryYearPeriod 取得週期
    const { startDate, endDate } = getAnniversaryYearPeriod(emp.hire_date, today)

    const usedResult = await env.DB.prepare(`
      SELECT COALESCE(SUM(total_hours), 0) AS used_hours
      FROM leave_requests
      WHERE employee_no = ?
        AND leave_type = 'annual'
        AND status = 'approved'
        AND start_date >= ? AND start_date <= ?
    `).bind(employeeNo, startDate, endDate).first()

    const usedHours = usedResult?.used_hours || 0
    const usedDays = usedHours / 8
    const remainingDays = Math.max(0, annualDays - usedDays)

    return jsonResponse({
      ok: true,
      employee_no: employeeNo,
      employee_name: emp.employee_name,
      hire_date: emp.hire_date,
      period: { startDate, endDate },
      months_worked: monthsWorked,
      annual_days: annualDays,
      used_hours: usedHours,
      used_days: usedDays,
      remaining_days: remainingDays
    })
  }

  // ========== 補休餘額查詢 ==========
  if (method === 'GET' && path === '/api/leave/comp-balance') {
    const employeeNo = String(url.searchParams.get('employee_no') || '').trim().toUpperCase()
    if (!employeeNo) return jsonResponse({ ok: false, message: '缺少 employee_no' }, 400)

    const earnedResult = await env.DB.prepare(`
      SELECT COALESCE(SUM(total_hours), 0) AS earned_hours
      FROM overtime_requests
      WHERE employee_no = ? AND status = 'approved' AND pay_method = 'comp_leave'
    `).bind(employeeNo).first()
    const earnedHours = earnedResult?.earned_hours || 0

    const usedResult = await env.DB.prepare(`
      SELECT COALESCE(SUM(total_hours), 0) AS used_hours
      FROM leave_requests
      WHERE employee_no = ? AND leave_type = 'comp' AND status = 'approved'
    `).bind(employeeNo).first()
    const usedHours = usedResult?.used_hours || 0

    const remainingHours = Math.max(0, earnedHours - usedHours)

    return jsonResponse({
      ok: true,
      employee_no: employeeNo,
      earned_hours: earnedHours,
      used_hours: usedHours,
      remaining_hours: remainingHours,
      remaining_days: remainingHours / 8
    })
  }

  // ========== 法定假別餘額查詢（曆年制 1/1~12/31，事假/病假/生理假共用） ==========
  if (method === 'GET' && path === '/api/leave/anniversary-balance') {
    const employeeNo = String(url.searchParams.get('employee_no') || '').trim().toUpperCase()
    const leaveTypeCode = String(url.searchParams.get('leave_type') || '').trim()
    const yearParam = url.searchParams.get('year')
    if (!employeeNo) return jsonResponse({ ok: false, message: '缺少 employee_no' }, 400)
    if (!leaveTypeCode) return jsonResponse({ ok: false, message: '缺少 leave_type' }, 400)

    const annualLimits = {
      personal: 14 * 8,   // 事假 14 天
      sick: 30 * 8,       // 病假 30 天
      physio: 3 * 8       // 生理假 3 天
    }
    const limitHours = annualLimits[leaveTypeCode]
    if (limitHours === undefined) {
      return jsonResponse({ ok: false, message: '此假別不適用此餘額查詢' }, 400)
    }

    const emp = await env.DB.prepare(`
      SELECT employee_no, employee_name FROM employees WHERE employee_no = ? AND is_active = 1
    `).bind(employeeNo).first()
    if (!emp) return jsonResponse({ ok: false, message: '查無此員工' }, 404)

    const year = Number(yearParam) || new Date().getFullYear()
    const startDate = `${year}-01-01`
    const endDate = `${year}-12-31`

    const usedResult = await env.DB.prepare(`
      SELECT COALESCE(SUM(total_hours), 0) AS used_hours
      FROM leave_requests
      WHERE employee_no = ?
        AND leave_type = ?
        AND status = 'approved'
        AND start_date >= ? AND start_date <= ?
    `).bind(employeeNo, leaveTypeCode, startDate, endDate).first()

    const usedHours = usedResult?.used_hours || 0
    const usedDays = usedHours / 8
    const limitDays = limitHours / 8
    const remainingDays = Math.max(0, limitDays - usedDays)
    const remainingHours = Math.max(0, limitHours - usedHours)

    return jsonResponse({
      ok: true,
      employee_no: employeeNo,
      employee_name: emp.employee_name,
      leave_type: leaveTypeCode,
      year,
      period: { startDate, endDate },
      limit_days: limitDays,
      used_hours: usedHours,
      used_days: usedDays,
      remaining_days: remainingDays,
      remaining_hours: remainingHours
    })
  }

  // ========== HR 管理專用 API ==========
  if (method === 'GET' && path === '/api/hr/employees') {
    const hrNo = url.searchParams.get('hr_no')
    if (!hrNo) return jsonResponse({ ok: false, message: '缺少 hr_no' }, 400)
    if (!(await isHr(env, hrNo))) {
      return jsonResponse({ ok: false, message: '無權限，僅人資可操作' }, 403)
    }
    const result = await env.DB.prepare(`
      SELECT
        e.employee_no,
        e.employee_name,
        e.department_name,
        e.position_title,
        e.rank_type,
        e.direct_manager_no,
        e.direct_manager_name,
        e.first_proxy_no,
        e.first_proxy_name,
        e.second_proxy_no,
        e.second_proxy_name,
        e.pin_code,
        e.hire_date,
        e.gender,
        e.employee_category,
        e.is_active,
        e.created_at,
        e.updated_at,
        ec.card_no
      FROM employees e
      LEFT JOIN employee_cards ec ON e.employee_no = ec.employee_no AND ec.is_active = 1
      ORDER BY e.employee_no ASC
    `).all()
    return jsonResponse({ ok: true, employees: result.results || [] })
  }

  if (method === 'POST' && path === '/api/hr/employee/upsert') {
    const body = await request.json()
    const hrNo = body.hr_no
    if (!hrNo) return jsonResponse({ ok: false, message: '缺少 hr_no' }, 400)
    if (!(await isHr(env, hrNo))) {
      return jsonResponse({ ok: false, message: '無權限，僅人資可操作' }, 403)
    }

    const employeeNo = String(body.employee_no || '').trim().toUpperCase()
    const employeeName = String(body.employee_name || '').trim()
    const departmentName = String(body.department_name || '').trim()
    const positionTitle = String(body.position_title || '').trim()
    const rankType = String(body.rank_type || '').trim()
    const directManagerNo = String(body.direct_manager_no || '').trim().toUpperCase() || null
    const directManagerName = String(body.direct_manager_name || '').trim() || null
    const firstProxyNo = String(body.first_proxy_no || '').trim().toUpperCase() || null
    const firstProxyName = String(body.first_proxy_name || '').trim() || null
    const secondProxyNo = String(body.second_proxy_no || '').trim().toUpperCase() || null
    const secondProxyName = String(body.second_proxy_name || '').trim() || null
    const pinCode = String(body.pin_code || '').trim() || employeeNo
    const hireDate = String(body.hire_date || '').trim() || null
    const gender = String(body.gender || '').trim() || null
    const employeeCategory = String(body.employee_category || 'indirect').trim()
    const isActive = body.is_active === undefined ? 1 : (body.is_active ? 1 : 0)
    const cardNo = String(body.card_no || '').trim() || null

    if (!employeeNo || !employeeName) {
      return jsonResponse({ ok: false, message: '員工編號與姓名為必填' }, 400)
    }

    const now = getTaiwanTimeString()
    const existing = await env.DB.prepare(`
      SELECT employee_no FROM employees WHERE employee_no = ?
    `).bind(employeeNo).first()

    if (existing) {
      await env.DB.prepare(`
        UPDATE employees
        SET employee_name = ?, department_name = ?, position_title = ?, rank_type = ?,
            direct_manager_no = ?, direct_manager_name = ?,
            first_proxy_no = ?, first_proxy_name = ?,
            second_proxy_no = ?, second_proxy_name = ?,
            pin_code = ?, hire_date = ?, gender = ?, employee_category = ?, is_active = ?, updated_at = ?
        WHERE employee_no = ?
      `).bind(
        employeeName, departmentName, positionTitle, rankType,
        directManagerNo, directManagerName,
        firstProxyNo, firstProxyName,
        secondProxyNo, secondProxyName,
        pinCode, hireDate, gender, employeeCategory, isActive, now, employeeNo
      ).run()
    } else {
      await env.DB.prepare(`
        INSERT INTO employees (
          employee_no, employee_name, department_name, position_title, rank_type,
          direct_manager_no, direct_manager_name,
          first_proxy_no, first_proxy_name, second_proxy_no, second_proxy_name,
          pin_code, hire_date, gender, employee_category, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        employeeNo, employeeName, departmentName, positionTitle, rankType,
        directManagerNo, directManagerName,
        firstProxyNo, firstProxyName,
        secondProxyNo, secondProxyName,
        pinCode, hireDate, gender, employeeCategory, isActive, now, now
      ).run()
    }

    if (cardNo) {
      await env.DB.prepare(`
        UPDATE employee_cards SET is_active = 0 WHERE employee_no = ? AND card_no <> ?
      `).bind(employeeNo, cardNo).run()
      await env.DB.prepare(`
        INSERT INTO employee_cards (employee_no, card_no, card_type, is_active, created_at)
        VALUES (?, ?, 'RFID', 1, ?)
        ON CONFLICT(card_no) DO UPDATE SET employee_no = excluded.employee_no, is_active = 1
      `).bind(employeeNo, cardNo, now).run()
    } else {
      await env.DB.prepare(`
        UPDATE employee_cards SET is_active = 0 WHERE employee_no = ?
      `).bind(employeeNo).run()
    }

    return jsonResponse({ ok: true, message: existing ? '員工資料已更新' : '員工已新增', employee_no: employeeNo })
  }

  if (method === 'POST' && path === '/api/hr/employee/deactivate') {
    const body = await request.json()
    const hrNo = body.hr_no
    if (!hrNo) return jsonResponse({ ok: false, message: '缺少 hr_no' }, 400)
    if (!(await isHr(env, hrNo))) {
      return jsonResponse({ ok: false, message: '無權限，僅人資可操作' }, 403)
    }
    const employeeNo = String(body.employee_no || '').trim().toUpperCase()
    if (!employeeNo) return jsonResponse({ ok: false, message: '缺少 employee_no' }, 400)

    const existing = await env.DB.prepare(`SELECT is_active FROM employees WHERE employee_no = ?`).bind(employeeNo).first()
    if (!existing) return jsonResponse({ ok: false, message: '查無此員工' }, 404)
    if (existing.is_active === 0) return jsonResponse({ ok: false, message: '員工已是停用狀態' }, 400)

    const now = getTaiwanTimeString()
    await env.DB.prepare(`UPDATE employees SET is_active = 0, updated_at = ? WHERE employee_no = ?`).bind(now, employeeNo).run()
    await env.DB.prepare(`UPDATE employee_cards SET is_active = 0 WHERE employee_no = ?`).bind(employeeNo).run()
    return jsonResponse({ ok: true, message: '員工已停用', employee_no: employeeNo })
  }

  // ----- 請假申請（加入性別檢查） -----
  if (method === 'POST' && path === '/api/leave/create') {
    const body = await request.json()
    const employeeNo = String(body.employee_no || '').trim().toUpperCase()
    const leaveType = String(body.leave_type || '').trim()
    const startDate = String(body.start_date || '').trim()
    const startTime = String(body.start_time || '').trim()
    const endDate = String(body.end_date || '').trim()
    const endTime = String(body.end_time || '').trim()
    const totalHours = Number(body.total_hours || 0)

    if (!employeeNo) return jsonResponse({ ok: false, message: '請輸入員工編號' }, 400)
    if (!leaveType) return jsonResponse({ ok: false, message: '請選擇假別' }, 400)
    if (!startDate || !endDate || !startTime || !endTime) {
      return jsonResponse({ ok: false, message: '請輸入完整日期時間' }, 400)
    }
    if (totalHours <= 0) return jsonResponse({ ok: false, message: '請假時數必須大於 0' }, 400)

    const employee = await getEmployee(env.DB, employeeNo)
    if (!employee) return jsonResponse({ ok: false, message: '查無此員工或已離職' }, 404)

    // ========== 性別限制檢查（產假/生理假等） ==========
    const leaveTypeRow = await env.DB.prepare(`
      SELECT gender_limit, name_zh FROM leave_types WHERE code = ?
    `).bind(leaveType).first()
    if (leaveTypeRow && leaveTypeRow.gender_limit) {
      const empGenderRow = await env.DB.prepare(`
        SELECT gender FROM employees WHERE employee_no = ?
      `).bind(employee.employee_no).first()
      const empGender = empGenderRow?.gender || null
      if (!empGender) {
        return jsonResponse({ ok: false, message: `此假別限定${leaveTypeRow.gender_limit === 'female' ? '女性' : '男性'}申請，但您尚未設定性別，請聯絡人資設定` }, 403)
      }
      if (empGender !== leaveTypeRow.gender_limit) {
        return jsonResponse({ ok: false, message: `「${leaveTypeRow.name_zh}」僅限${leaveTypeRow.gender_limit === 'female' ? '女性' : '男性'}員工申請` }, 403)
      }
    }

    const hrNo = getHrNo(env)
    const hrName = await getEmployeeName(env.DB, hrNo)
    if (!hrNo) return jsonResponse({ ok: false, message: '系統尚未設定人資編號' }, 500)

    const now = getTaiwanTimeString()
    const insert = await env.DB.prepare(`
      INSERT INTO leave_requests (
        employee_no, employee_name, leave_type,
        start_date, start_time, end_date, end_time,
        total_hours, reason, status, approval_stage,
        current_approver_no, current_approver_name,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'hr', ?, ?, ?, ?)
    `).bind(
      employee.employee_no, employee.employee_name, leaveType,
      startDate, startTime, endDate, endTime,
      totalHours, body.reason || '',
      hrNo, hrName, now, now
    ).run()

    // 病假自動發信通知，提醒上傳診斷書
    const sickLeaveTypes = ['病假', 'sick', 'sick_leave', 'SICK']
    const isSickLeave = sickLeaveTypes.some(t => leaveType.includes(t))
    if (isSickLeave && env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'HR System <onboarding@resend.dev>',
            to: ['imd13@everbiz.com.tw'],
            subject: `【病假通知】${employee.employee_name}（${employee.employee_no}）申請病假`,
            html: `
              <h2>病假申請通知</h2>
              <p>以下員工已送出病假申請，請提醒繳交診斷書：</p>
              <table style="border-collapse:collapse;width:100%">
                <tr><td style="padding:8px;border:1px solid #ddd;background:#f5f5f5"><strong>員工編號</strong></td><td style="padding:8px;border:1px solid #ddd">${employee.employee_no}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd;background:#f5f5f5"><strong>姓名</strong></td><td style="padding:8px;border:1px solid #ddd">${employee.employee_name}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd;background:#f5f5f5"><strong>部門</strong></td><td style="padding:8px;border:1px solid #ddd">${employee.department_name || '-'}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd;background:#f5f5f5"><strong>假別</strong></td><td style="padding:8px;border:1px solid #ddd">${leaveType}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd;background:#f5f5f5"><strong>開始時間</strong></td><td style="padding:8px;border:1px solid #ddd">${startDate} ${startTime}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd;background:#f5f5f5"><strong>結束時間</strong></td><td style="padding:8px;border:1px solid #ddd">${endDate} ${endTime}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd;background:#f5f5f5"><strong>時數</strong></td><td style="padding:8px;border:1px solid #ddd">${totalHours} 小時</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd;background:#f5f5f5"><strong>原因</strong></td><td style="padding:8px;border:1px solid #ddd">${body.reason || '（未填寫）'}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd;background:#f5f5f5"><strong>申請時間</strong></td><td style="padding:8px;border:1px solid #ddd">${now}</td></tr>
              </table>
              <p style="margin-top:16px;color:#e74c3c"><strong>請回覆此郵件並附上診斷書照片，或請員工於核准後 3 日內繳交紙本。</strong></p>
            `
          })
        })
      } catch (emailErr) {
        console.error('Resend email error:', emailErr)
      }
    }

    return jsonResponse({
      ok: true,
      message: '請假單已送出，待人資審核',
      leave_request_id: insert.meta.last_row_id,
      current_approver_no: hrNo,
      current_approver_name: hrName,
      total_hours: totalHours
    })
  }

  // ----- 補卡申請 -----
  if (method === 'POST' && path === '/api/punch/create') {
    const body = await request.json()
    const employeeNo = String(body.employee_no || '').trim().toUpperCase()
    const punchType = String(body.punch_type || '').trim()
    const punchDate = String(body.punch_date || '').trim()
    const punchTime = String(body.punch_time || '').trim()
    if (!employeeNo || !punchType || !punchDate || !punchTime) {
      return jsonResponse({ ok: false, message: '補卡資料不完整' }, 400)
    }
    const employee = await getEmployee(env.DB, employeeNo)
    if (!employee) return jsonResponse({ ok: false, message: '查無此員工或已離職' }, 404)

    const hrNo = getHrNo(env)
    const hrName = await getEmployeeName(env.DB, hrNo)
    if (!hrNo) return jsonResponse({ ok: false, message: '系統尚未設定人資編號' }, 500)

    const now = getTaiwanTimeString()
    const insert = await env.DB.prepare(`
      INSERT INTO punch_requests (
        employee_no, employee_name, punch_type,
        punch_date, punch_time, reason,
        status, approval_stage,
        current_approver_no, current_approver_name,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'hr', ?, ?, ?, ?)
    `).bind(
      employee.employee_no, employee.employee_name, punchType,
      punchDate, punchTime, body.reason || '',
      hrNo, hrName, now, now
    ).run()
    return jsonResponse({
      ok: true,
      message: '補卡申請已送出，待人資審核',
      punch_request_id: insert.meta.last_row_id,
      current_approver_no: hrNo,
      current_approver_name: hrName
    })
  }

  // ----- 加班申請 (含 pay_method) -----
  if (method === 'POST' && path === '/api/overtime/create') {
    const body = await request.json()
    const employeeNo = String(body.employee_no || '').trim().toUpperCase()
    const overtimeDate = String(body.overtime_date || '').trim()
    const startTime = String(body.start_time || '').trim()
    const endTime = String(body.end_time || '').trim()
    const totalHours = Number(body.total_hours || calculateSimpleHoursForWorker(startTime, endTime))
    const overtimeType = determineOvertimeType(overtimeDate)
    const payMethod = String(body.pay_method || 'overtime_pay').trim()

    if (!employeeNo || !overtimeDate || !startTime || !endTime) {
      return jsonResponse({ ok: false, message: '加班資料不完整' }, 400)
    }
    if (totalHours <= 0) return jsonResponse({ ok: false, message: '加班時數必須大於 0' }, 400)

    const employee = await getEmployee(env.DB, employeeNo)
    if (!employee) return jsonResponse({ ok: false, message: '查無此員工或已離職' }, 404)

    const hrNo = getHrNo(env)
    const hrName = await getEmployeeName(env.DB, hrNo)
    if (!hrNo) return jsonResponse({ ok: false, message: '系統尚未設定人資編號' }, 500)

    const now = getTaiwanTimeString()
    const insert = await env.DB.prepare(`
      INSERT INTO overtime_requests (
        employee_no, employee_name, overtime_type,
        overtime_date, start_time, end_time, total_hours,
        reason, pay_method, status, approval_stage,
        current_approver_no, current_approver_name,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'hr', ?, ?, ?, ?)
    `).bind(
      employee.employee_no, employee.employee_name, overtimeType,
      overtimeDate, startTime, endTime, totalHours,
      body.reason || '', payMethod,
      hrNo, hrName, now, now
    ).run()

    return jsonResponse({
      ok: true,
      message: '加班申請已送出，待人資審核',
      overtime_request_id: insert.meta.last_row_id,
      current_approver_no: hrNo,
      current_approver_name: hrName,
      total_hours: totalHours
    })
  }

  // ----- Excel 批次匯入加班 -----
  if (method === 'POST' && path === '/api/overtime/import') {
    const body = await request.json()
    const importerNo = String(body.importer_no || '').trim().toUpperCase()
    const rows = Array.isArray(body.rows) ? body.rows : []
    if (!importerNo) return jsonResponse({ ok: false, message: '缺少 importer_no' }, 400)
    if (rows.length === 0) return jsonResponse({ ok: false, message: '沒有可匯入的加班資料' }, 400)

    const importer = await getEmployee(env.DB, importerNo)
    if (!importer) return jsonResponse({ ok: false, message: '匯入人員不存在或已停用' }, 404)

    const importBatchId = `OT-${Date.now()}`
    const now = getTaiwanTimeString()
    let inserted = 0
    const errors = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const lineNo = i + 2
      const employeeNo = String(row.employee_no || '').trim().toUpperCase()
      const overtimeDate = String(row.overtime_date || '').trim()
      const startTime = String(row.start_time || '').trim()
      const endTime = String(row.end_time || '').trim()
      const reason = String(row.reason || '').trim()
      const payType = String(row.pay_type || '').trim()

      if (!employeeNo) { errors.push(`第 ${lineNo} 列缺少員工編號`); continue }
      if (!overtimeDate || !startTime || !endTime) { errors.push(`第 ${lineNo} 列缺少日期或時間`); continue }
      if (!reason) { errors.push(`第 ${lineNo} 列缺少加班原因`); continue }
      if (!payType) { errors.push(`第 ${lineNo} 列缺少給付方式`); continue }

      const employee = await getEmployee(env.DB, employeeNo)
      if (!employee) { errors.push(`第 ${lineNo} 列員工不存在或已停用：${employeeNo}`); continue }

      const totalHours = calculateSimpleHoursForWorker(startTime, endTime)
      if (totalHours <= 0) { errors.push(`第 ${lineNo} 列加班時數必須大於 0`); continue }

      const overtimeType = determineOvertimeType(overtimeDate)
      const hrNo = getHrNo(env)
      const hrName = await getEmployeeName(env.DB, hrNo)

      await env.DB.prepare(`
        INSERT INTO overtime_requests (
          employee_no, employee_name, department_name, overtime_type, overtime_date,
          start_time, end_time, total_hours, reason, overtime_shift, cost_department,
          customer, work_order_no, quantity, due_date, description, pay_type,
          import_batch_id, source_type, status, approval_stage,
          current_approver_no, current_approver_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'excel', 'pending', 'hr', ?, ?, ?, ?)
      `).bind(
        employee.employee_no, employee.employee_name, row.department_name || employee.department_name || '',
        overtimeType, overtimeDate, startTime, endTime, totalHours, reason,
        row.overtime_shift || '', row.cost_department || '', row.customer || '',
        row.work_order_no || '', row.quantity || '', row.due_date || '', row.description || '',
        payType, importBatchId, hrNo, hrName, now, now
      ).run()
      inserted++
    }
    return jsonResponse({ ok: true, message: `匯入完成，成功 ${inserted} 筆，錯誤 ${errors.length} 筆`, inserted, errors, import_batch_id: importBatchId })
  }

  // ----- 我的假單 -----
  if (method === 'GET' && path === '/api/leave/my') {
    const employeeNo = url.searchParams.get('employee_no')
    if (!employeeNo) return jsonResponse({ ok: false, message: '缺少 employee_no' }, 400)
    const result = await env.DB.prepare(`SELECT * FROM leave_requests WHERE employee_no = ? ORDER BY created_at DESC`).bind(employeeNo.trim().toUpperCase()).all()
    return jsonResponse({ ok: true, leaves: result.results })
  }

  if (method === 'GET' && path === '/api/punch/my') {
    const employeeNo = url.searchParams.get('employee_no')
    if (!employeeNo) return jsonResponse({ ok: false, message: '缺少 employee_no' }, 400)
    const result = await env.DB.prepare(`SELECT * FROM punch_requests WHERE employee_no = ? ORDER BY created_at DESC`).bind(employeeNo.trim().toUpperCase()).all()
    return jsonResponse({ ok: true, punches: result.results || [] })
  }

  if (method === 'GET' && path === '/api/overtime/my') {
    const employeeNo = url.searchParams.get('employee_no')
    if (!employeeNo) return jsonResponse({ ok: false, message: '缺少 employee_no' }, 400)
    const result = await env.DB.prepare(`SELECT * FROM overtime_requests WHERE employee_no = ? ORDER BY created_at DESC`).bind(employeeNo.trim().toUpperCase()).all()
    return jsonResponse({ ok: true, overtimes: result.results || [] })
  }

  // ========== 待審核列表 ==========
  if (method === 'GET' && path === '/api/leave/pending') {
    const approverNo = url.searchParams.get('approver_no')
    if (!approverNo) return jsonResponse({ ok: false, message: '缺少 approver_no' }, 400)
    const normalized = approverNo.trim().toUpperCase()
    const leaves = await env.DB.prepare(`
      SELECT lr.*
      FROM leave_requests lr
      LEFT JOIN employees applicant ON lr.employee_no = applicant.employee_no
      WHERE lr.status = 'pending'
        AND ( lr.current_approver_no = ?
          OR ( lr.approval_stage = 'proxy' AND (applicant.first_proxy_no = ? OR applicant.second_proxy_no = ?) )
        )
      ORDER BY lr.created_at DESC
    `).bind(normalized, normalized, normalized).all()
    const punches = await env.DB.prepare(`SELECT * FROM punch_requests WHERE status = 'pending' AND current_approver_no = ? ORDER BY created_at DESC`).bind(normalized).all()
    const overtimes = await env.DB.prepare(`SELECT * FROM overtime_requests WHERE status = 'pending' AND current_approver_no = ? ORDER BY created_at DESC`).bind(normalized).all()
    return jsonResponse({ ok: true, leaves: leaves.results || [], punches: punches.results || [], overtimes: overtimes.results || [] })
  }

  // ========== 請假審核 ==========
  if (method === 'POST' && path === '/api/leave/approve') {
    const body = await request.json()
    const leaveId = Number(body.leave_id || 0)
    const approverNo = String(body.approver_no || '').trim().toUpperCase()
    const action = body.action
    if (!leaveId || !approverNo || !action) return jsonResponse({ ok: false, message: '缺少必要欄位' }, 400)
    if (!['approved', 'rejected'].includes(action)) return jsonResponse({ ok: false, message: 'action 只能為 approved 或 rejected' }, 400)

    const leave = await env.DB.prepare(`
      SELECT lr.*
      FROM leave_requests lr
      LEFT JOIN employees applicant ON lr.employee_no = applicant.employee_no
      WHERE lr.id = ? AND lr.status = 'pending'
        AND ( lr.current_approver_no = ?
          OR ( lr.approval_stage = 'proxy' AND (applicant.first_proxy_no = ? OR applicant.second_proxy_no = ?) )
        )
    `).bind(leaveId, approverNo, approverNo, approverNo).first()
    if (!leave) return jsonResponse({ ok: false, message: '無待審核假單或無權限' }, 404)

    const now = getTaiwanTimeString()
    if (action === 'rejected') {
      await env.DB.prepare(`UPDATE leave_requests SET status = 'rejected', updated_at = ? WHERE id = ?`).bind(now, leaveId).run()
      return jsonResponse({ ok: true, message: '假單已駁回' })
    }

    const nextApprover = await getNextLeaveApprover(env, env.DB, leave.employee_no, leave.approval_stage, leave.total_hours)
    if (!nextApprover) {
      await env.DB.prepare(`UPDATE leave_requests SET status = 'approved', updated_at = ? WHERE id = ?`).bind(now, leaveId).run()
      await applyApprovedLeaveToAttendance(env.DB, leave, now)
      return jsonResponse({ ok: true, message: '假單已核准' })
    } else {
      await env.DB.prepare(`UPDATE leave_requests SET approval_stage = ?, current_approver_no = ?, current_approver_name = ?, updated_at = ? WHERE id = ?`)
        .bind(nextApprover.stage, nextApprover.no, nextApprover.name, now, leaveId).run()
      return jsonResponse({ ok: true, message: `已核准，轉送 ${nextApprover.name} / ${nextApprover.no} 審核`, next_approver_no: nextApprover.no, next_approver_name: nextApprover.name })
    }
  }

  // ========== 補卡審核 ==========
  if (method === 'POST' && path === '/api/punch/action') {
    const body = await request.json()
    const punchId = Number(body.punch_request_id || 0)
    const approverNo = String(body.approver_employee_no || '').trim().toUpperCase()
    const action = body.action
    if (!punchId || !approverNo || !action) return jsonResponse({ ok: false, message: '缺少必要欄位' }, 400)
    if (!['approved', 'rejected'].includes(action)) return jsonResponse({ ok: false, message: 'action 只能為 approved 或 rejected' }, 400)

    const punch = await env.DB.prepare(`
      SELECT p.*, e.direct_manager_no, e.direct_manager_name
      FROM punch_requests p JOIN employees e ON p.employee_no = e.employee_no
      WHERE p.id = ? AND p.status = 'pending' AND p.current_approver_no = ?
    `).bind(punchId, approverNo).first()
    if (!punch) return jsonResponse({ ok: false, message: '無待審核補卡單或無權限' }, 404)

    const now = getTaiwanTimeString()
    if (action === 'rejected') {
      await env.DB.prepare(`UPDATE punch_requests SET status = 'rejected', updated_at = ? WHERE id = ?`).bind(now, punchId).run()
      return jsonResponse({ ok: true, message: '補卡已駁回' })
    }

    if (punch.approval_stage === 'hr') {
      const next = await getNextPunchOvertimeApprover(env.DB, punch.employee_no, 'hr')
      if (!next) {
        await env.DB.prepare(`UPDATE punch_requests SET status = 'approved', updated_at = ? WHERE id = ?`).bind(now, punchId).run()
        await applyApprovedPunchToAttendance(env.DB, punch, now)
        return jsonResponse({ ok: true, message: '補卡已核准（無直屬主管）' })
      } else {
        await env.DB.prepare(`UPDATE punch_requests SET approval_stage = ?, current_approver_no = ?, current_approver_name = ?, updated_at = ? WHERE id = ?`)
          .bind(next.stage, next.no, next.name, now, punchId).run()
        return jsonResponse({ ok: true, message: `人資已核准，轉送主管 ${next.name} / ${next.no} 審核` })
      }
    }
    if (punch.approval_stage === 'manager') {
      await env.DB.prepare(`UPDATE punch_requests SET status = 'approved', updated_at = ? WHERE id = ?`).bind(now, punchId).run()
      await applyApprovedPunchToAttendance(env.DB, punch, now)
      return jsonResponse({ ok: true, message: '補卡已核准' })
    }
    return jsonResponse({ ok: false, message: '未知的審核階段' }, 400)
  }

  // ========== 加班審核 ==========
  if (method === 'POST' && path === '/api/overtime/action') {
    const body = await request.json()
    const overtimeId = Number(body.overtime_request_id || 0)
    const approverNo = String(body.approver_employee_no || '').trim().toUpperCase()
    const action = body.action
    if (!overtimeId || !approverNo || !action) return jsonResponse({ ok: false, message: '缺少必要欄位' }, 400)
    if (!['approved', 'rejected'].includes(action)) return jsonResponse({ ok: false, message: 'action 只能為 approved 或 rejected' }, 400)

    const overtime = await env.DB.prepare(`
      SELECT o.*, e.direct_manager_no, e.direct_manager_name
      FROM overtime_requests o JOIN employees e ON o.employee_no = e.employee_no
      WHERE o.id = ? AND o.status = 'pending' AND o.current_approver_no = ?
    `).bind(overtimeId, approverNo).first()
    if (!overtime) return jsonResponse({ ok: false, message: '無待審核加班單或無權限' }, 404)

    const now = getTaiwanTimeString()
    if (action === 'rejected') {
      await env.DB.prepare(`UPDATE overtime_requests SET status = 'rejected', updated_at = ? WHERE id = ?`).bind(now, overtimeId).run()
      return jsonResponse({ ok: true, message: '加班已駁回' })
    }

    if (overtime.approval_stage === 'hr') {
      const next = await getNextPunchOvertimeApprover(env.DB, overtime.employee_no, 'hr')
      if (!next) {
        await env.DB.prepare(`UPDATE overtime_requests SET status = 'approved', updated_at = ? WHERE id = ?`).bind(now, overtimeId).run()
        return jsonResponse({ ok: true, message: '加班已核准（無直屬主管）' })
      } else {
        await env.DB.prepare(`UPDATE overtime_requests SET approval_stage = ?, current_approver_no = ?, current_approver_name = ?, updated_at = ? WHERE id = ?`)
          .bind(next.stage, next.no, next.name, now, overtimeId).run()
        return jsonResponse({ ok: true, message: `人資已核准，轉送主管 ${next.name} / ${next.no} 審核` })
      }
    }
    if (overtime.approval_stage === 'manager') {
      await env.DB.prepare(`UPDATE overtime_requests SET status = 'approved', updated_at = ? WHERE id = ?`).bind(now, overtimeId).run()
      return jsonResponse({ ok: true, message: '加班已核准' })
    }
    return jsonResponse({ ok: false, message: '未知的審核階段' }, 400)
  }

  // ----- 取消假單 -----
  if (method === 'POST' && path === '/api/leave/cancel') {
    const body = await request.json()
    const leaveId = Number(body.leave_id || 0)
    const employeeNo = String(body.employee_no || '').trim().toUpperCase()
    const cancelReason = String(body.cancel_reason || '').trim()
    if (!leaveId || !employeeNo) return jsonResponse({ ok: false, message: '缺少必要欄位' }, 400)
    if (!cancelReason) return jsonResponse({ ok: false, message: '請輸入取消原因' }, 400)
    const leave = await env.DB.prepare(`SELECT * FROM leave_requests WHERE id = ? AND employee_no = ? AND status = 'pending'`).bind(leaveId, employeeNo).first()
    if (!leave) return jsonResponse({ ok: false, message: '查無此待審核假單，或無權限取消' }, 404)

    const now = getTaiwanTimeString()
    await env.DB.prepare(`
      UPDATE leave_requests
      SET status = 'cancelled', cancelled_by_no = ?, cancelled_by_name = (SELECT employee_name FROM employees WHERE employee_no = ?),
          cancel_reason = ?, cancelled_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(employeeNo, employeeNo, cancelReason, now, now, leaveId).run()
    return jsonResponse({ ok: true, message: '假單已取消' })
  }

  // ----- 作廢假單（HR 專用）-----
  if (method === 'POST' && path === '/api/leave/void') {
    const body = await request.json()
    const leaveId = Number(body.leave_id || 0)
    const hrNo = String(body.hr_no || '').trim().toUpperCase()
    const voidReason = String(body.void_reason || '').trim()
    if (!leaveId || !hrNo || !voidReason) return jsonResponse({ ok: false, message: '缺少必要欄位' }, 400)
    if (!(await isHr(env, hrNo))) return jsonResponse({ ok: false, message: '僅人資可作廢假單' }, 403)
    const leave = await env.DB.prepare(`SELECT * FROM leave_requests WHERE id = ? AND status NOT IN ('voided', 'cancelled')`).bind(leaveId).first()
    if (!leave) return jsonResponse({ ok: false, message: '查無此假單，或已作廢/取消無法再次作廢' }, 404)

    const now = getTaiwanTimeString()
    await env.DB.prepare(`
      UPDATE leave_requests
      SET status = 'voided', voided_by_no = ?, voided_by_name = (SELECT employee_name FROM employees WHERE employee_no = ?),
          void_reason = ?, updated_at = ?
      WHERE id = ?
    `).bind(hrNo, hrNo, voidReason, now, leaveId).run()
    return jsonResponse({ ok: true, message: '假單已作廢' })
  }

  // ----- HR 報表 -----
  if (method === 'GET' && path === '/api/hr/report') {
    const leaves = await env.DB.prepare(`SELECT * FROM leave_requests ORDER BY created_at DESC`).all()
    const punches = await env.DB.prepare(`SELECT * FROM punch_requests ORDER BY created_at DESC`).all()
    const overtimes = await env.DB.prepare(`SELECT * FROM overtime_requests ORDER BY created_at DESC`).all()
    return jsonResponse({ ok: true, leaves: leaves.results, punches: punches.results, overtimes: overtimes.results })
  }

  // ===== 修改點 3：HR 已核准報表（僅回傳請假） =====
  if (method === 'GET' && path === '/api/hr/report/approved') {
    const leaves = await env.DB.prepare(`
      SELECT * FROM leave_requests WHERE status = 'approved' ORDER BY created_at DESC
    `).all()
    return jsonResponse({ ok: true, leaves: leaves.results })
  }

  // ----- 除錯路由 -----
  if (method === 'GET' && path === '/api/debug/db') {
    try {
      const countStmt = await env.DB.prepare('SELECT COUNT(*) as count FROM employees').first()
      const leaveCountStmt = await env.DB.prepare('SELECT COUNT(*) as count FROM leave_requests').first()
      const attendanceCountStmt = await env.DB.prepare('SELECT COUNT(*) as count FROM attendance_daily').first()
      return jsonResponse({ ok: true, employees: countStmt?.count || 0, leave_requests: leaveCountStmt?.count || 0, attendance_daily: attendanceCountStmt?.count || 0, message: '資料庫連線正常' })
    } catch (err) {
      return jsonResponse({ ok: false, error: err.message }, 500)
    }
  }

  if (method === 'GET' && path === '/api/debug/version') {
    return jsonResponse({
      ok: true,
      version: 'final-attendance-summary-20260623-fix-both',
      has_import_txt: true
    })
  }

  if (method === 'GET' && path === '/api/debug/cards') {
    try {
      const result = await env.DB.prepare(`
        SELECT card_no, employee_no, is_active, created_at
        FROM employee_cards
        ORDER BY employee_no
        LIMIT 20
      `).all()
      return jsonResponse({ ok: true, cards: result.results || [] })
    } catch (err) {
      return jsonResponse({ ok: false, error: err.message }, 500)
    }
  }

  // ========== TXT刷卡匯入（整合完整遲到規則與異常狀態） ==========
  // ===== 修改點 4：此處 SQL 中的 late_grace 條件同步改為 > '08:00:59' =====
  if (method === 'POST' && path === '/api/attendance/import-txt') {
    const body = await request.json()
    const lines = Array.isArray(body.lines) ? body.lines : []
    if (lines.length === 0) return jsonResponse({ ok: false, message: '沒有刷卡資料' }, 400)

    // 一次載入所有卡號對應
    const cardMapResult = await env.DB.prepare(`
      SELECT ec.card_no, ec.employee_no, e.employee_name
      FROM employee_cards ec
      LEFT JOIN employees e ON ec.employee_no = e.employee_no
      WHERE ec.is_active = 1
    `).all()
    const cardMap = new Map()
    for (const row of (cardMapResult.results || [])) {
      cardMap.set(row.card_no, { employee_no: row.employee_no, employee_name: row.employee_name || '' })
    }

    const errors = []
    const importedDates = new Set()
    const now = getTaiwanTimeString()
    const validRows = []

    for (let i = 0; i < lines.length; i++) {
      const line = String(lines[i] || '').trim()
      if (!line) continue
      const parts = line.split(',')
      if (parts.length < 5) {
        errors.push(`第 ${i + 1} 行格式錯誤`)
        continue
      }
      // 卡號格式：parts[0] + ',' + parts[1]
      const cardNo = `${parts[0].trim()},${parts[1].trim()}`
      const punchDate = parts[3].replaceAll('/', '-')
      const punchTime = parts[4]
      const rawDatetime = `${punchDate} ${punchTime}`
      const card = cardMap.get(cardNo)
      if (!card) {
        errors.push(`第 ${i + 1} 行找不到卡號：${cardNo}`)
        continue
      }
      validRows.push({
        cardNo,
        employeeNo: card.employee_no,
        employeeName: card.employee_name,
        punchDate,
        punchTime,
        rawDatetime
      })
      importedDates.add(punchDate)
    }

    // 獲取需要處理的日期列表
    const dateList = Array.from(importedDates)
    if (dateList.length > 0) {
      // 先刪除同日期、同來源的舊刷卡記錄，避免重複累積
      await env.DB.prepare(`
        DELETE FROM attendance_logs
        WHERE punch_date IN (${dateList.map(() => '?').join(',')})
          AND source_type = 'txt_rpa'
      `).bind(...dateList).run()
    }

    // 批次 INSERT，每次最多 10 筆
    const BATCH_SIZE = 10
    let inserted = 0
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE)
      const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, \'txt_rpa\', ?)').join(',')
      const values = []
      for (const r of batch) {
        values.push(r.cardNo, r.employeeNo, r.employeeName, r.punchDate, r.punchTime, r.rawDatetime, now)
      }
      await env.DB.prepare(`
        INSERT INTO attendance_logs (card_no, employee_no, employee_name, punch_date, punch_time, raw_datetime, source_type, created_at)
        VALUES ${placeholders}
      `).bind(...values).run()
      inserted += batch.length
    }

    // 彙總 attendance_daily 與異常
    if (dateList.length > 0) {
      await env.DB.prepare(`DELETE FROM attendance_daily WHERE work_date IN (${dateList.map(() => '?').join(',')})`).bind(...dateList).run()
      await env.DB.prepare(`
        INSERT INTO attendance_daily (employee_no, employee_name, work_date, first_punch_time, last_punch_time, status_note, updated_at)
        SELECT employee_no, employee_name, punch_date, MIN(punch_time), MAX(punch_time), 'RPA TXT自動彙總', ?
        FROM attendance_logs
        WHERE punch_date IN (${dateList.map(() => '?').join(',')})
        GROUP BY employee_no, employee_name, punch_date
      `).bind(now, ...dateList).run()

      // 完整遲到規則：>08:10:59 為 late，08:01:00~08:10:59 為 late_grace
      // 原條件 > '08:00:00' 改為 > '08:00:59'
      await env.DB.prepare(`
        UPDATE attendance_daily
        SET punch_fix_status = CASE
          WHEN first_punch_time > '08:10:59' AND last_punch_time < '17:00:00' THEN 'late_and_early_leave'
          WHEN first_punch_time > '08:10:59' THEN 'late'
          WHEN first_punch_time > '08:00:59' THEN 'late_grace'
          WHEN last_punch_time < '17:00:00' THEN 'early_leave'
          ELSE 'normal'
        END
        WHERE work_date IN (${dateList.map(() => '?').join(',')})
      `).bind(...dateList).run()

      // 產生異常紀錄
      await env.DB.prepare(`DELETE FROM attendance_exceptions WHERE work_date IN (${dateList.map(() => '?').join(',')})`).bind(...dateList).run()
      await env.DB.prepare(`
        INSERT INTO attendance_exceptions (
          employee_no, employee_name, work_date, exception_type,
          status, reason_text, created_at
        )
        SELECT
          employee_no,
          employee_name,
          work_date,
          punch_fix_status,
          CASE
            WHEN punch_fix_status = 'late_grace' THEN 'need_reason'
            ELSE 'pending'
          END,
          NULL,
          ?
        FROM attendance_daily
        WHERE punch_fix_status <> 'normal'
          AND work_date IN (${dateList.map(() => '?').join(',')})
      `).bind(now, ...dateList).run()
    }

    return jsonResponse({
      ok: true,
      message: `匯入完成，成功 ${inserted} 筆，錯誤 ${errors.length} 筆`,
      inserted,
      errors
    })
  }

  // ========== 員工補上異常原因 ==========
  if (method === 'POST' && path === '/api/attendance/exception-reason') {
    const body = await request.json()
    const employeeNo = String(body.employee_no || '').trim().toUpperCase()
    const workDate = String(body.work_date || '').trim()
    const reason = String(body.reason || '').trim()

    if (!employeeNo || !workDate || !reason) {
      return jsonResponse({ ok: false, message: '缺少 employee_no, work_date 或 reason' }, 400)
    }

    const employee = await getEmployee(env.DB, employeeNo)
    if (!employee) {
      return jsonResponse({ ok: false, message: '員工不存在或已停用' }, 404)
    }

    const now = getTaiwanTimeString()
    const result = await env.DB.prepare(`
      UPDATE attendance_exceptions
      SET reason_text = ?, status = 'resolved', updated_at = ?
      WHERE employee_no = ? AND work_date = ? AND status = 'need_reason'
    `).bind(reason, now, employeeNo, workDate).run()

    if (result.changes === 0) {
      return jsonResponse({ ok: false, message: '找不到對應的待填寫原因紀錄，或已填寫過' }, 404)
    }

    return jsonResponse({ ok: true, message: '異常原因已填寫完成' })
  }

  // ========== HR 審核異常（核准/駁回）==========
  if (method === 'POST' && path === '/api/attendance/exception-review') {
    const body = await request.json()
    const reviewerNo = String(body.reviewer_no || '').trim().toUpperCase()
    const employeeNo = String(body.employee_no || '').trim().toUpperCase()
    const workDate = String(body.work_date || '').trim()
    const action = body.action

    if (!reviewerNo || !employeeNo || !workDate || !action) {
      return jsonResponse({ ok: false, message: '缺少必要欄位' }, 400)
    }
    if (!['approved', 'rejected'].includes(action)) {
      return jsonResponse({ ok: false, message: 'action 必須為 approved 或 rejected' }, 400)
    }

    const reviewer = await getEmployee(env.DB, reviewerNo)
    if (!reviewer) return jsonResponse({ ok: false, message: '審核人員不存在或已停用' }, 404)
    const role = determineSystemRole(reviewerNo, reviewer.rank_type, reviewer.position_title, getHrNo(env))
    if (role !== 'hr' && role !== 'general_manager') {
      return jsonResponse({ ok: false, message: '無權限，僅人資或總經理可審核異常' }, 403)
    }

    const now = getTaiwanTimeString()
    const result = await env.DB.prepare(`
      UPDATE attendance_exceptions
      SET status = ?, updated_at = ?
      WHERE employee_no = ? AND work_date = ? AND status = 'pending'
    `).bind(action, now, employeeNo, workDate).run()

    if (result.changes === 0) {
      return jsonResponse({ ok: false, message: '找不到對應的待審核異常紀錄，或已審核過' }, 404)
    }

    return jsonResponse({ ok: true, message: `異常已${action === 'approved' ? '核准' : '駁回'}` })
  }

  // ========== 異常列表 API (權限區分) ==========
  if (method === 'GET' && path === '/api/attendance/exceptions') {
    const viewerNo = String(url.searchParams.get('viewer_no') || '').trim().toUpperCase()
    if (!viewerNo) return jsonResponse({ ok: false, message: '缺少 viewer_no' }, 400)

    const viewer = await getEmployee(env.DB, viewerNo)
    if (!viewer) return jsonResponse({ ok: false, message: '查無使用者' }, 404)

    const role = determineSystemRole(viewer.employee_no, viewer.rank_type, viewer.position_title, getHrNo(env))
    let result

    if (role === 'hr' || role === 'general_manager') {
      result = await env.DB.prepare(`
        SELECT employee_no, employee_name, work_date, exception_type, reason_text, status
        FROM attendance_exceptions
        ORDER BY work_date DESC, employee_no
      `).all()
    } else if (role === 'manager') {
      result = await env.DB.prepare(`
        SELECT ae.employee_no, ae.employee_name, ae.work_date, ae.exception_type, ae.reason_text, ae.status
        FROM attendance_exceptions ae
        LEFT JOIN employees e ON ae.employee_no = e.employee_no
        WHERE ae.employee_no = ? OR e.direct_manager_no = ?
        ORDER BY ae.work_date DESC
      `).bind(viewerNo, viewerNo).all()
    } else {
      result = await env.DB.prepare(`
        SELECT employee_no, employee_name, work_date, exception_type, reason_text, status
        FROM attendance_exceptions
        WHERE employee_no = ?
        ORDER BY work_date DESC
      `).bind(viewerNo).all()
    }

    return jsonResponse({ ok: true, exceptions: result.results || [] })
  }

  // ========== 管理出勤 (權限區分) ==========
  if (method === 'GET' && path === '/api/attendance/daily') {
    const viewerNo = String(url.searchParams.get('viewer_no') || '').trim().toUpperCase()
    if (!viewerNo) return jsonResponse({ ok: false, message: '缺少 viewer_no' }, 400)
    const viewer = await getEmployee(env.DB, viewerNo)
    if (!viewer) return jsonResponse({ ok: false, message: '查無使用者' }, 404)

    const role = determineSystemRole(viewer.employee_no, viewer.rank_type, viewer.position_title, getHrNo(env))
    let result
    if (role === 'hr' || role === 'general_manager') {
      result = await env.DB.prepare(`
        SELECT * FROM attendance_daily ORDER BY work_date DESC, employee_no
      `).all()
    } else if (role === 'manager') {
      result = await env.DB.prepare(`
        SELECT a.*
        FROM attendance_daily a
        LEFT JOIN employees e ON a.employee_no = e.employee_no
        WHERE a.employee_no = ? OR e.direct_manager_no = ?
        ORDER BY a.work_date DESC, a.employee_no
      `).bind(viewerNo, viewerNo).all()
    } else {
      result = await env.DB.prepare(`
        SELECT * FROM attendance_daily WHERE employee_no = ? ORDER BY work_date DESC
      `).bind(viewerNo).all()
    }
    return jsonResponse({ ok: true, attendance: result.results || [] })
  }

  // ========== 個人出勤匯總 (個人報表，支援月份篩選) ==========
  if (method === 'GET' && path === '/api/report/my-summary') {
    const employeeNo = String(url.searchParams.get('employee_no') || '').trim().toUpperCase()
    if (!employeeNo) return jsonResponse({ ok: false, message: '缺少 employee_no' }, 400)

    const viewer = await getEmployee(env.DB, employeeNo)
    if (!viewer) return jsonResponse({ ok: false, message: '員工不存在或已停用' }, 404)

    const monthParam = url.searchParams.get('month')
    let startDate, endDate, monthStr
    if (monthParam) {
      const period = getMonthPeriod(monthParam)
      startDate = period.startDate
      endDate = period.endDate
      monthStr = period.monthStr
    } else {
      const period = getMonthPeriod()
      startDate = period.startDate
      endDate = period.endDate
      monthStr = period.monthStr
    }

    const expectedWorkDays = countExpectedWorkDays(startDate, endDate)
    const holidayList = nationalHolidays.map(d => "'" + d + "'").join(',')

    const summary = await env.DB.prepare(`
      SELECT
        a.employee_no,
        a.employee_name,
        SUM(CASE WHEN a.first_punch_time IS NOT NULL
          AND strftime('%w', a.work_date) NOT IN ('0', '6')
          AND a.work_date NOT IN (${holidayList})
          THEN 1 ELSE 0 END) AS work_days,
        SUM(CASE WHEN a.punch_fix_status = 'late' THEN 1 ELSE 0 END) AS late_count,
        SUM(CASE WHEN a.punch_fix_status = 'late_grace' THEN 1 ELSE 0 END) AS late_grace_count,
        SUM(CASE WHEN a.punch_fix_status = 'early_leave' THEN 1 ELSE 0 END) AS early_leave_count,
        COALESCE((
          SELECT SUM(lr.total_hours)
          FROM leave_requests lr
          WHERE lr.employee_no = a.employee_no
            AND lr.status = 'approved'
            AND lr.start_date BETWEEN ? AND ?
        ), 0) AS leave_hours,
        COALESCE((
          SELECT SUM(ot.total_hours)
          FROM overtime_requests ot
          WHERE ot.employee_no = a.employee_no
            AND ot.status = 'approved'
            AND ot.overtime_date BETWEEN ? AND ?
        ), 0) AS overtime_hours,
        COALESCE((
          SELECT COUNT(DISTINCT ot.overtime_date)
          FROM overtime_requests ot
          WHERE ot.employee_no = a.employee_no
            AND ot.status = 'approved'
            AND ot.overtime_date BETWEEN ? AND ?
        ), 0) AS overtime_days
      FROM attendance_daily a
      WHERE a.employee_no = ?
        AND a.work_date BETWEEN ? AND ?
      GROUP BY a.employee_no, a.employee_name
    `).bind(startDate, endDate, startDate, endDate, startDate, endDate, employeeNo, startDate, endDate).first()

    const leaveDaysResult = await env.DB.prepare(`
      SELECT COUNT(DISTINCT DATE(lr.start_date)) AS approved_leave_days
      FROM leave_requests lr
      WHERE lr.employee_no = ?
        AND lr.status = 'approved'
        AND lr.start_date BETWEEN ? AND ?
    `).bind(employeeNo, startDate, endDate).first()
    const approvedLeaveDays = leaveDaysResult?.approved_leave_days || 0

    const actualAttendance = await env.DB.prepare(`
      SELECT COUNT(DISTINCT work_date) AS actual_days
      FROM (
        SELECT work_date FROM attendance_daily
        WHERE employee_no = ? AND work_date BETWEEN ? AND ? AND first_punch_time IS NOT NULL
          AND strftime('%w', work_date) NOT IN ('0', '6')
          AND work_date NOT IN (${holidayList})
        UNION
        SELECT start_date FROM leave_requests WHERE employee_no = ? AND status = 'approved' AND start_date BETWEEN ? AND ?
      ) t
    `).bind(employeeNo, startDate, endDate, employeeNo, startDate, endDate).first()
    const actualAttendanceDays = actualAttendance?.actual_days || 0

    const workDays = summary?.work_days || 0
    const lateCount = summary?.late_count || 0
    const overtimeDays = summary?.overtime_days || 0
    const leaveHours = summary?.leave_hours || 0
    const overtimeHours = summary?.overtime_hours || 0

    const lateRate = expectedWorkDays === 0 ? 0 : lateCount / expectedWorkDays
    const attendanceRate = expectedWorkDays === 0 ? 0 : workDays / expectedWorkDays
    const actualAttendanceRate = expectedWorkDays === 0 ? 0 : actualAttendanceDays / expectedWorkDays

    const result = {
      employee_no: employeeNo,
      employee_name: viewer.employee_name,
      work_days: workDays,
      approved_leave_days: approvedLeaveDays,
      actual_attendance_days: actualAttendanceDays,
      expected_work_days: expectedWorkDays,
      late_count: lateCount,
      late_grace_count: summary?.late_grace_count || 0,
      early_leave_count: summary?.early_leave_count || 0,
      leave_hours: leaveHours,
      overtime_hours: overtimeHours,
      overtime_days: overtimeDays,
      late_rate: lateRate,
      attendance_rate: attendanceRate,
      actual_attendance_rate: actualAttendanceRate,
      formatted_late_rate: `${(lateRate * 100).toFixed(2)}%`,
      formatted_attendance_rate: `${(attendanceRate * 100).toFixed(2)}%`,
      formatted_actual_attendance_rate: `${(actualAttendanceRate * 100).toFixed(2)}%`,
      period: { startDate, endDate, month: monthStr, expected_work_days: expectedWorkDays }
    }
    return jsonResponse({ ok: true, data: result })
  }

  // ========== 主管團隊出勤匯總 (主管報表，支援月份篩選) ==========
  if (method === 'GET' && path === '/api/report/team-summary') {
    const viewerNo = String(url.searchParams.get('viewer_no') || '').trim().toUpperCase()
    if (!viewerNo) return jsonResponse({ ok: false, message: '缺少 viewer_no' }, 400)

    const viewer = await getEmployee(env.DB, viewerNo)
    if (!viewer) return jsonResponse({ ok: false, message: '查無使用者' }, 404)

    const role = determineSystemRole(viewer.employee_no, viewer.rank_type, viewer.position_title, getHrNo(env))
    if (role !== 'manager' && role !== 'hr' && role !== 'general_manager') {
      return jsonResponse({ ok: false, message: '無權限，僅主管、人資或總經理可檢視團隊報表' }, 403)
    }

    const monthParam = url.searchParams.get('month')
    let startDate, endDate, monthStr
    if (monthParam) {
      const period = getMonthPeriod(monthParam)
      startDate = period.startDate
      endDate = period.endDate
      monthStr = period.monthStr
    } else {
      const period = getMonthPeriod()
      startDate = period.startDate
      endDate = period.endDate
      monthStr = period.monthStr
    }

    const expectedWorkDays = countExpectedWorkDays(startDate, endDate)
    const holidayList = nationalHolidays.map(d => "'" + d + "'").join(',')

    const teamMembers = await env.DB.prepare(`
      SELECT DISTINCT employee_no, employee_name
      FROM employees
      WHERE employee_no = ? OR direct_manager_no = ?
    `).bind(viewerNo, viewerNo).all()
    const memberNos = (teamMembers.results || []).map(m => m.employee_no)
    if (memberNos.length === 0) {
      return jsonResponse({ ok: true, data: [], period: { startDate, endDate, month: monthStr, expected_work_days: expectedWorkDays } })
    }

    const summaryResults = await env.DB.prepare(`
      SELECT
        a.employee_no,
        a.employee_name,
        SUM(CASE WHEN a.first_punch_time IS NOT NULL
          AND strftime('%w', a.work_date) NOT IN ('0', '6')
          AND a.work_date NOT IN (${holidayList})
          THEN 1 ELSE 0 END) AS work_days,
        SUM(CASE WHEN a.punch_fix_status = 'late' THEN 1 ELSE 0 END) AS late_count,
        SUM(CASE WHEN a.punch_fix_status = 'late_grace' THEN 1 ELSE 0 END) AS late_grace_count,
        SUM(CASE WHEN a.punch_fix_status = 'early_leave' THEN 1 ELSE 0 END) AS early_leave_count,
        COALESCE((
          SELECT SUM(lr.total_hours)
          FROM leave_requests lr
          WHERE lr.employee_no = a.employee_no
            AND lr.status = 'approved'
            AND lr.start_date BETWEEN ? AND ?
        ), 0) AS leave_hours,
        COALESCE((
          SELECT SUM(ot.total_hours)
          FROM overtime_requests ot
          WHERE ot.employee_no = a.employee_no
            AND ot.status = 'approved'
            AND ot.overtime_date BETWEEN ? AND ?
        ), 0) AS overtime_hours,
        COALESCE((
          SELECT COUNT(DISTINCT ot.overtime_date)
          FROM overtime_requests ot
          WHERE ot.employee_no = a.employee_no
            AND ot.status = 'approved'
            AND ot.overtime_date BETWEEN ? AND ?
        ), 0) AS overtime_days
      FROM attendance_daily a
      WHERE (a.employee_no = ? OR a.employee_no IN (SELECT employee_no FROM employees WHERE direct_manager_no = ?))
        AND a.work_date BETWEEN ? AND ?
      GROUP BY a.employee_no, a.employee_name
    `).bind(startDate, endDate, startDate, endDate, startDate, endDate, viewerNo, viewerNo, startDate, endDate).all()

    const leaveDaysResults = await env.DB.prepare(`
      SELECT
        lr.employee_no,
        COUNT(DISTINCT lr.start_date) AS approved_leave_days
      FROM leave_requests lr
      WHERE lr.status = 'approved'
        AND lr.start_date BETWEEN ? AND ?
        AND (lr.employee_no = ? OR lr.employee_no IN (SELECT employee_no FROM employees WHERE direct_manager_no = ?))
      GROUP BY lr.employee_no
    `).bind(startDate, endDate, viewerNo, viewerNo).all()
    const leaveDaysMap = new Map()
    for (const row of (leaveDaysResults.results || [])) {
      leaveDaysMap.set(row.employee_no, row.approved_leave_days)
    }

    const actualDaysResults = await env.DB.prepare(`
      SELECT
        employee_no,
        COUNT(DISTINCT work_date) AS actual_days
      FROM (
        SELECT employee_no, work_date FROM attendance_daily
        WHERE work_date BETWEEN ? AND ? AND first_punch_time IS NOT NULL
          AND strftime('%w', work_date) NOT IN ('0', '6')
          AND work_date NOT IN (${holidayList})
          AND (employee_no = ? OR employee_no IN (SELECT employee_no FROM employees WHERE direct_manager_no = ?))
        UNION
        SELECT lr.employee_no, lr.start_date FROM leave_requests lr
        WHERE lr.status = 'approved' AND lr.start_date BETWEEN ? AND ?
          AND (lr.employee_no = ? OR lr.employee_no IN (SELECT employee_no FROM employees WHERE direct_manager_no = ?))
      ) t
      GROUP BY employee_no
    `).bind(startDate, endDate, viewerNo, viewerNo, startDate, endDate, viewerNo, viewerNo).all()
    const actualDaysMap = new Map()
    for (const row of (actualDaysResults.results || [])) {
      actualDaysMap.set(row.employee_no, row.actual_days)
    }

    const data = (summaryResults.results || []).map(row => {
      const workDays = row.work_days || 0
      const lateCount = row.late_count || 0
      const overtimeDays = row.overtime_days || 0
      const approvedLeaveDays = leaveDaysMap.get(row.employee_no) || 0
      const actualAttendanceDays = actualDaysMap.get(row.employee_no) || 0

      const lateRate = expectedWorkDays === 0 ? 0 : lateCount / expectedWorkDays
      const attendanceRate = expectedWorkDays === 0 ? 0 : workDays / expectedWorkDays
      const actualAttendanceRate = expectedWorkDays === 0 ? 0 : actualAttendanceDays / expectedWorkDays

      return {
        ...row,
        approved_leave_days: approvedLeaveDays,
        actual_attendance_days: actualAttendanceDays,
        expected_work_days: expectedWorkDays,
        late_rate: lateRate,
        attendance_rate: attendanceRate,
        actual_attendance_rate: actualAttendanceRate,
        formatted_late_rate: `${(lateRate * 100).toFixed(2)}%`,
        formatted_attendance_rate: `${(attendanceRate * 100).toFixed(2)}%`,
        formatted_actual_attendance_rate: `${(actualAttendanceRate * 100).toFixed(2)}%`,
        overtime_days: overtimeDays
      }
    })

    return jsonResponse({ ok: true, data: data, period: { startDate, endDate, month: monthStr, expected_work_days: expectedWorkDays } })
  }

  // ========== HR 總報表 (全公司出勤匯總，支援月份篩選) ==========
  if (method === 'GET' && path === '/api/hr/attendance-summary') {
    const hrNo = url.searchParams.get('hr_no')
    if (!hrNo) return jsonResponse({ ok: false, message: '缺少 hr_no' }, 400)
    if (!(await isHr(env, hrNo))) {
      return jsonResponse({ ok: false, message: '無權限，僅人資可操作' }, 403)
    }

    const monthParam = url.searchParams.get('month')
    let startDate, endDate, monthStr
    if (monthParam) {
      const period = getMonthPeriod(monthParam)
      startDate = period.startDate
      endDate = period.endDate
      monthStr = period.monthStr
    } else {
      const period = getMonthPeriod()
      startDate = period.startDate
      endDate = period.endDate
      monthStr = period.monthStr
    }

    const expectedWorkDays = countExpectedWorkDays(startDate, endDate)
    const holidayList = nationalHolidays.map(d => "'" + d + "'").join(',')

    const summaryResults = await env.DB.prepare(`
      SELECT
        a.employee_no,
        a.employee_name,
        e.department_name,
        SUM(CASE WHEN a.first_punch_time IS NOT NULL
          AND strftime('%w', a.work_date) NOT IN ('0', '6')
          AND a.work_date NOT IN (${holidayList})
          THEN 1 ELSE 0 END) AS work_days,
        SUM(CASE WHEN a.punch_fix_status = 'late' THEN 1 ELSE 0 END) AS late_count,
        SUM(CASE WHEN a.punch_fix_status = 'late_grace' THEN 1 ELSE 0 END) AS late_grace_count,
        SUM(CASE WHEN a.punch_fix_status = 'early_leave' THEN 1 ELSE 0 END) AS early_leave_count,
        COALESCE((
          SELECT SUM(lr.total_hours)
          FROM leave_requests lr
          WHERE lr.employee_no = a.employee_no
            AND lr.status = 'approved'
            AND lr.start_date BETWEEN ? AND ?
        ), 0) AS leave_hours,
        COALESCE((
          SELECT SUM(ot.total_hours)
          FROM overtime_requests ot
          WHERE ot.employee_no = a.employee_no
            AND ot.status = 'approved'
            AND ot.overtime_date BETWEEN ? AND ?
        ), 0) AS overtime_hours,
        COALESCE((
          SELECT COUNT(DISTINCT ot.overtime_date)
          FROM overtime_requests ot
          WHERE ot.employee_no = a.employee_no
            AND ot.status = 'approved'
            AND ot.overtime_date BETWEEN ? AND ?
        ), 0) AS overtime_days
      FROM attendance_daily a
      LEFT JOIN employees e ON a.employee_no = e.employee_no
      WHERE a.work_date BETWEEN ? AND ?
      GROUP BY a.employee_no, a.employee_name, e.department_name
      ORDER BY e.department_name, a.employee_no
    `).bind(startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate).all()

    const allEmployeeNos = [...new Set((summaryResults.results || []).map(r => r.employee_no))]
    if (allEmployeeNos.length > 0) {
      const leaveDaysResults = await env.DB.prepare(`
        SELECT
          lr.employee_no,
          COUNT(DISTINCT lr.start_date) AS approved_leave_days
        FROM leave_requests lr
        WHERE lr.status = 'approved'
          AND lr.start_date BETWEEN ? AND ?
          AND lr.employee_no IN (
            SELECT DISTINCT employee_no FROM attendance_daily WHERE work_date BETWEEN ? AND ?
          )
        GROUP BY lr.employee_no
      `).bind(startDate, endDate, startDate, endDate).all()
      const leaveDaysMap = new Map()
      for (const row of (leaveDaysResults.results || [])) {
        leaveDaysMap.set(row.employee_no, row.approved_leave_days)
      }

      const actualDaysResults = await env.DB.prepare(`
        SELECT
          employee_no,
          COUNT(DISTINCT work_date) AS actual_days
        FROM (
          SELECT employee_no, work_date FROM attendance_daily
          WHERE work_date BETWEEN ? AND ? AND first_punch_time IS NOT NULL
            AND strftime('%w', work_date) NOT IN ('0', '6')
            AND work_date NOT IN (${holidayList})
          UNION
          SELECT lr.employee_no, lr.start_date FROM leave_requests lr
          WHERE lr.status = 'approved' AND lr.start_date BETWEEN ? AND ?
            AND lr.employee_no IN (
              SELECT DISTINCT employee_no FROM attendance_daily WHERE work_date BETWEEN ? AND ?
            )
        ) t
        GROUP BY employee_no
      `).bind(startDate, endDate, startDate, endDate, startDate, endDate).all()
      const actualDaysMap = new Map()
      for (const row of (actualDaysResults.results || [])) {
        actualDaysMap.set(row.employee_no, row.actual_days)
      }

      const data = (summaryResults.results || []).map(row => {
        const workDays = row.work_days || 0
        const lateCount = row.late_count || 0
        const overtimeDays = row.overtime_days || 0
        const approvedLeaveDays = leaveDaysMap.get(row.employee_no) || 0
        const actualAttendanceDays = actualDaysMap.get(row.employee_no) || 0

        const lateRate = expectedWorkDays === 0 ? 0 : lateCount / expectedWorkDays
        const attendanceRate = expectedWorkDays === 0 ? 0 : workDays / expectedWorkDays
        const actualAttendanceRate = expectedWorkDays === 0 ? 0 : actualAttendanceDays / expectedWorkDays

        return {
          ...row,
          approved_leave_days: approvedLeaveDays,
          actual_attendance_days: actualAttendanceDays,
          expected_work_days: expectedWorkDays,
          late_rate: lateRate,
          attendance_rate: attendanceRate,
          actual_attendance_rate: actualAttendanceRate,
          formatted_late_rate: `${(lateRate * 100).toFixed(2)}%`,
          formatted_attendance_rate: `${(attendanceRate * 100).toFixed(2)}%`,
          formatted_actual_attendance_rate: `${(actualAttendanceRate * 100).toFixed(2)}%`,
          overtime_days: overtimeDays
        }
      })
      return jsonResponse({ ok: true, data: data, period: { startDate, endDate, month: monthStr, expected_work_days: expectedWorkDays } })
    } else {
      return jsonResponse({ ok: true, data: [], period: { startDate, endDate, month: monthStr, expected_work_days: expectedWorkDays } })
    }
  }

  if (method === 'GET' && path === '/') {
    return new Response('Everbiz HR System API Running', { status: 200 })
  }

  return new Response('Not Found', { status: 404 })
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env)
  }
}
