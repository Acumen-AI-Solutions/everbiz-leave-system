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
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  })
}

function getTaiwanTimeString() {
  const now = new Date()
  const taiwanTime = new Date(now.getTime() + (8 * 60 * 60 * 1000))
  return taiwanTime.toISOString().replace('T', ' ').slice(0, 19)
}

// ----- 新增輔助函式（用於加班自動計算）-----
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

function determineOvertimeType(dateString) {
  const nationalHolidays = [
    '2026-01-01',
    '2026-02-16',
    '2026-02-17',
    '2026-02-18',
    '2026-02-19',
    '2026-02-20',
    '2026-02-27',
    '2026-04-03',
    '2026-04-06',
    '2026-06-19',
    '2026-09-25',
    '2026-10-09',
    '2027-01-01',
    '2027-02-04',
    '2027-02-05',
    '2027-02-06',
    '2027-02-08',
    '2027-02-09',
    '2027-03-01',
    '2027-04-05',
    '2027-04-06',
    '2027-06-09',
    '2027-09-15',
    '2027-10-11'
  ]

  if (nationalHolidays.includes(dateString)) {
    return 'national_holiday'
  }

  const date = new Date(`${dateString}T00:00:00+08:00`)
  const day = date.getDay()

  if (day === 0 || day === 6) {
    return 'weekend'
  }

  return 'weekday'
}
// ----- 輔助函式結束 -----

async function getEmployee(db, employeeNo) {
  if (!employeeNo) return null
  const stmt = await db.prepare(`
    SELECT
      employee_no,
      employee_name,
      department_name,
      position_title,
      rank_type,
      direct_manager_no,
      direct_manager_name,
      first_proxy_no,
      first_proxy_name,
      second_proxy_no,
      second_proxy_name,
      is_active
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

async function isHr(env, hrNo) {
  if (!hrNo) return false
  const user = await getEmployee(env.DB, hrNo)
  if (!user) return false
  const role = determineSystemRole(hrNo, user.rank_type, user.position_title, getHrNo(env))
  return role === 'hr'
}

// ========== 請假流程：取得下一個審核人 ==========
// 順序：代理人（不指定特定代理人） → 直屬主管 → 董事長（僅當請假時數 > 24 小時） → null
async function getNextLeaveApprover(env, db, employeeNo, currentStage, totalHours) {
  const applicant = await getEmployee(db, employeeNo)
  if (!applicant) return null

  const stages = ['hr', 'proxy', 'manager', 'chairman']
  const currentIndex = stages.indexOf(currentStage)
  if (currentIndex === -1) return null

  for (let i = currentIndex + 1; i < stages.length; i++) {
    const stage = stages[i]
    if (stage === 'proxy') {
      // 只要有任一代理人，就進入代理人階段（不指定特定代理人）
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

// ========== 補卡/加班流程：HR → 直屬主管 → 結束 ==========
async function getNextPunchOvertimeApprover(db, employeeNo, currentStage) {
  if (currentStage === 'hr') {
    const applicant = await getEmployee(db, employeeNo)
    if (applicant && applicant.direct_manager_no) {
      const managerNo = applicant.direct_manager_no.trim().toUpperCase()
      const managerName = applicant.direct_manager_name || await getEmployeeName(db, managerNo)
      return { no: managerNo, name: managerName, stage: 'manager' }
    } else {
      return null
    }
  }
  return null
}

// ========== 路由處理 ==========
async function handleRequest(request, env) {
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method

  if (method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    })
  }

  // ----- 登入 -----
  if (method === 'POST' && path === '/api/auth/login') {
    const body = await request.json()
    const employeeNo = String(body.employee_no || '').trim().toUpperCase()
    const pinCode = String(body.pin_code || '').trim()
    if (!employeeNo || !pinCode) {
      return jsonResponse({ ok: false, message: '請輸入員工編號與 PIN Code' }, 400)
    }
    const stmt = await env.DB.prepare(`
      SELECT
        employee_no, employee_name, department_name, position_title, rank_type,
        direct_manager_no, direct_manager_name, pin_code, is_active
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
        is_active: user.is_active,
        system_role: systemRole
      }
    })
  }

  // ----- 員工列表（一般使用者）-----
  if (method === 'GET' && path === '/api/employees') {
    const result = await env.DB.prepare(`
      SELECT
        employee_no,
        employee_name,
        department_name,
        position_title,
        rank_type,
        direct_manager_no,
        direct_manager_name,
        is_active
      FROM employees
      WHERE is_active = 1
      ORDER BY employee_no ASC
    `).all()
    return jsonResponse({ ok: true, employees: result.results || [] })
  }

  // ----- 假別列表（三語假別主檔）-----
  if (method === 'GET' && path === '/api/leave/types') {
    const result = await env.DB.prepare(`
      SELECT
        code,
        name_zh,
        name_en,
        name_vi,
        sort_order
      FROM leave_types
      WHERE is_active = 1
      ORDER BY sort_order ASC
    `).all()

    return jsonResponse({
      ok: true,
      leave_types: result.results || []
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
        employee_no,
        employee_name,
        department_name,
        position_title,
        rank_type,
        direct_manager_no,
        direct_manager_name,
        first_proxy_no,
        first_proxy_name,
        second_proxy_no,
        second_proxy_name,
        pin_code,
        is_active,
        created_at,
        updated_at
      FROM employees
      ORDER BY employee_no ASC
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
    const isActive = body.is_active === undefined ? 1 : (body.is_active ? 1 : 0)

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
        SET
          employee_name = ?,
          department_name = ?,
          position_title = ?,
          rank_type = ?,
          direct_manager_no = ?,
          direct_manager_name = ?,
          first_proxy_no = ?,
          first_proxy_name = ?,
          second_proxy_no = ?,
          second_proxy_name = ?,
          pin_code = ?,
          is_active = ?,
          updated_at = ?
        WHERE employee_no = ?
      `).bind(
        employeeName, departmentName, positionTitle, rankType,
        directManagerNo, directManagerName,
        firstProxyNo, firstProxyName,
        secondProxyNo, secondProxyName,
        pinCode, isActive, now, employeeNo
      ).run()
      return jsonResponse({ ok: true, message: '員工資料已更新', employee_no: employeeNo })
    } else {
      await env.DB.prepare(`
        INSERT INTO employees (
          employee_no, employee_name, department_name, position_title, rank_type,
          direct_manager_no, direct_manager_name,
          first_proxy_no, first_proxy_name,
          second_proxy_no, second_proxy_name,
          pin_code, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        employeeNo, employeeName, departmentName, positionTitle, rankType,
        directManagerNo, directManagerName,
        firstProxyNo, firstProxyName,
        secondProxyNo, secondProxyName,
        pinCode, isActive, now, now
      ).run()
      return jsonResponse({ ok: true, message: '員工已新增', employee_no: employeeNo })
    }
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

    const existing = await env.DB.prepare(`
      SELECT is_active FROM employees WHERE employee_no = ?
    `).bind(employeeNo).first()
    if (!existing) return jsonResponse({ ok: false, message: '查無此員工' }, 404)
    if (existing.is_active === 0) return jsonResponse({ ok: false, message: '員工已是停用狀態' }, 400)

    const now = getTaiwanTimeString()
    await env.DB.prepare(`
      UPDATE employees SET is_active = 0, updated_at = ? WHERE employee_no = ?
    `).bind(now, employeeNo).run()
    return jsonResponse({ ok: true, message: '員工已停用', employee_no: employeeNo })
  }

  // ========== 請假申請（第一關：人資） ==========
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

  // ----- 加班申請（已修改：自動判斷加班類型與時數）-----
  if (method === 'POST' && path === '/api/overtime/create') {
    const body = await request.json()
    const employeeNo = String(body.employee_no || '').trim().toUpperCase()
    const overtimeDate = String(body.overtime_date || '').trim()
    const startTime = String(body.start_time || '').trim()
    const endTime = String(body.end_time || '').trim()
    // 若前端未提供 total_hours，自動計算
    const totalHours = Number(body.total_hours || calculateSimpleHoursForWorker(startTime, endTime))
    const overtimeType = determineOvertimeType(overtimeDate)   // 自動判斷

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
        reason, status, approval_stage,
        current_approver_no, current_approver_name,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'hr', ?, ?, ?, ?)
    `).bind(
      employee.employee_no, employee.employee_name, overtimeType,
      overtimeDate, startTime, endTime, totalHours,
      body.reason || '',
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

  // ----- Excel 批次匯入加班申請（新增）-----
  if (method === 'POST' && path === '/api/overtime/import') {
    const body = await request.json()
    const importerNo = String(body.importer_no || '').trim().toUpperCase()
    const rows = Array.isArray(body.rows) ? body.rows : []

    if (!importerNo) {
      return jsonResponse({ ok: false, message: '缺少 importer_no' }, 400)
    }

    if (rows.length === 0) {
      return jsonResponse({ ok: false, message: '沒有可匯入的加班資料' }, 400)
    }

    const importer = await getEmployee(env.DB, importerNo)
    if (!importer) {
      return jsonResponse({ ok: false, message: '匯入人員不存在或已停用' }, 404)
    }

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

      if (!employeeNo) {
        errors.push(`第 ${lineNo} 列缺少員工編號`)
        continue
      }

      if (!overtimeDate || !startTime || !endTime) {
        errors.push(`第 ${lineNo} 列缺少日期或時間`)
        continue
      }

      if (!reason) {
        errors.push(`第 ${lineNo} 列缺少加班原因`)
        continue
      }

      if (!payType) {
        errors.push(`第 ${lineNo} 列缺少給付方式`)
        continue
      }

      const employee = await getEmployee(env.DB, employeeNo)
      if (!employee) {
        errors.push(`第 ${lineNo} 列員工不存在或已停用：${employeeNo}`)
        continue
      }

      const totalHours = calculateSimpleHoursForWorker(startTime, endTime)

      if (totalHours <= 0) {
        errors.push(`第 ${lineNo} 列加班時數必須大於 0`)
        continue
      }

      const overtimeType = determineOvertimeType(overtimeDate)

      const hrNo = getHrNo(env)
      const hrName = await getEmployeeName(env.DB, hrNo)

      await env.DB.prepare(`
        INSERT INTO overtime_requests (
          employee_no,
          employee_name,
          department_name,
          overtime_type,
          overtime_date,
          start_time,
          end_time,
          total_hours,
          reason,
          overtime_shift,
          cost_department,
          customer,
          work_order_no,
          quantity,
          due_date,
          description,
          pay_type,
          import_batch_id,
          source_type,
          status,
          approval_stage,
          current_approver_no,
          current_approver_name,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'excel', 'pending', 'hr', ?, ?, ?, ?)
      `).bind(
        employee.employee_no,
        employee.employee_name,
        row.department_name || employee.department_name || '',
        overtimeType,
        overtimeDate,
        startTime,
        endTime,
        totalHours,
        reason,
        row.overtime_shift || '',
        row.cost_department || '',
        row.customer || '',
        row.work_order_no || '',
        row.quantity || '',
        row.due_date || '',
        row.description || '',
        payType,
        importBatchId,
        hrNo,
        hrName,
        now,
        now
      ).run()

      inserted++
    }

    return jsonResponse({
      ok: true,
      message: `匯入完成，成功 ${inserted} 筆，錯誤 ${errors.length} 筆`,
      inserted,
      errors,
      import_batch_id: importBatchId
    })
  }

  // ----- 我的假單 -----
  if (method === 'GET' && path === '/api/leave/my') {
    const employeeNo = url.searchParams.get('employee_no')
    if (!employeeNo) return jsonResponse({ ok: false, message: '缺少 employee_no' }, 400)
    const result = await env.DB.prepare(`
      SELECT * FROM leave_requests WHERE employee_no = ? ORDER BY created_at DESC
    `).bind(employeeNo.trim().toUpperCase()).all()
    return jsonResponse({ ok: true, leaves: result.results })
  }

  if (method === 'GET' && path === '/api/punch/my') {
    const employeeNo = url.searchParams.get('employee_no')
    if (!employeeNo) return jsonResponse({ ok: false, message: '缺少 employee_no' }, 400)
    const result = await env.DB.prepare(`
      SELECT * FROM punch_requests WHERE employee_no = ? ORDER BY created_at DESC
    `).bind(employeeNo.trim().toUpperCase()).all()
    return jsonResponse({ ok: true, punches: result.results || [] })
  }

  if (method === 'GET' && path === '/api/overtime/my') {
    const employeeNo = url.searchParams.get('employee_no')
    if (!employeeNo) return jsonResponse({ ok: false, message: '缺少 employee_no' }, 400)
    const result = await env.DB.prepare(`
      SELECT * FROM overtime_requests WHERE employee_no = ? ORDER BY created_at DESC
    `).bind(employeeNo.trim().toUpperCase()).all()
    return jsonResponse({ ok: true, overtimes: result.results || [] })
  }

  // ========== 待審核列表 ==========
  if (method === 'GET' && path === '/api/leave/pending') {
    const approverNo = url.searchParams.get('approver_no')
    if (!approverNo) {
      return jsonResponse({ ok: false, message: '缺少 approver_no' }, 400)
    }
    const normalized = approverNo.trim().toUpperCase()

    // 請假：支援代理人（申請人的第一/第二代理人且 approval_stage = 'proxy'）
    const leaves = await env.DB.prepare(`
      SELECT lr.*
      FROM leave_requests lr
      LEFT JOIN employees applicant ON lr.employee_no = applicant.employee_no
      WHERE
        lr.status = 'pending'
        AND (
          lr.current_approver_no = ?
          OR (
            lr.approval_stage = 'proxy'
            AND (
              applicant.first_proxy_no = ?
              OR applicant.second_proxy_no = ?
            )
          )
        )
      ORDER BY lr.created_at DESC
    `).bind(normalized, normalized, normalized).all()

    // 補卡：僅限本人（不支援代理人）
    const punches = await env.DB.prepare(`
      SELECT * FROM punch_requests
      WHERE status = 'pending' AND current_approver_no = ?
      ORDER BY created_at DESC
    `).bind(normalized).all()

    // 加班：僅限本人（不支援代理人）
    const overtimes = await env.DB.prepare(`
      SELECT * FROM overtime_requests
      WHERE status = 'pending' AND current_approver_no = ?
      ORDER BY created_at DESC
    `).bind(normalized).all()

    return jsonResponse({
      ok: true,
      leaves: leaves.results || [],
      punches: punches.results || [],
      overtimes: overtimes.results || []
    })
  }

  // ========== 請假審核（支援代理人） ==========
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
      WHERE
        lr.id = ?
        AND lr.status = 'pending'
        AND (
          lr.current_approver_no = ?
          OR (
            lr.approval_stage = 'proxy'
            AND (
              applicant.first_proxy_no = ?
              OR applicant.second_proxy_no = ?
            )
          )
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
      return jsonResponse({ ok: true, message: '假單已核准' })
    } else {
      await env.DB.prepare(`
        UPDATE leave_requests
        SET approval_stage = ?, current_approver_no = ?, current_approver_name = ?, updated_at = ?
        WHERE id = ?
      `).bind(nextApprover.stage, nextApprover.no, nextApprover.name, now, leaveId).run()
      return jsonResponse({
        ok: true,
        message: `已核准，轉送 ${nextApprover.name} / ${nextApprover.no} 審核`,
        next_approver_no: nextApprover.no,
        next_approver_name: nextApprover.name
      })
    }
  }

  // ========== 補卡審核（僅限本人） ==========
  if (method === 'POST' && path === '/api/punch/action') {
    const body = await request.json()
    const punchId = Number(body.punch_request_id || 0)
    const approverNo = String(body.approver_employee_no || '').trim().toUpperCase()
    const action = body.action
    if (!punchId || !approverNo || !action) return jsonResponse({ ok: false, message: '缺少必要欄位' }, 400)
    if (!['approved', 'rejected'].includes(action)) return jsonResponse({ ok: false, message: 'action 只能為 approved 或 rejected' }, 400)

    const punch = await env.DB.prepare(`
      SELECT p.*, e.direct_manager_no, e.direct_manager_name
      FROM punch_requests p
      JOIN employees e ON p.employee_no = e.employee_no
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
        return jsonResponse({ ok: true, message: '補卡已核准（無直屬主管）' })
      } else {
        await env.DB.prepare(`
          UPDATE punch_requests
          SET approval_stage = ?, current_approver_no = ?, current_approver_name = ?, updated_at = ?
          WHERE id = ?
        `).bind(next.stage, next.no, next.name, now, punchId).run()
        return jsonResponse({ ok: true, message: `人資已核准，轉送主管 ${next.name} / ${next.no} 審核` })
      }
    }
    if (punch.approval_stage === 'manager') {
      await env.DB.prepare(`UPDATE punch_requests SET status = 'approved', updated_at = ? WHERE id = ?`).bind(now, punchId).run()
      return jsonResponse({ ok: true, message: '補卡已核准' })
    }
    return jsonResponse({ ok: false, message: '未知的審核階段' }, 400)
  }

  // ========== 加班審核（僅限本人） ==========
  if (method === 'POST' && path === '/api/overtime/action') {
    const body = await request.json()
    const overtimeId = Number(body.overtime_request_id || 0)
    const approverNo = String(body.approver_employee_no || '').trim().toUpperCase()
    const action = body.action
    if (!overtimeId || !approverNo || !action) return jsonResponse({ ok: false, message: '缺少必要欄位' }, 400)
    if (!['approved', 'rejected'].includes(action)) return jsonResponse({ ok: false, message: 'action 只能為 approved 或 rejected' }, 400)

    const overtime = await env.DB.prepare(`
      SELECT o.*, e.direct_manager_no, e.direct_manager_name
      FROM overtime_requests o
      JOIN employees e ON o.employee_no = e.employee_no
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
        await env.DB.prepare(`
          UPDATE overtime_requests
          SET approval_stage = ?, current_approver_no = ?, current_approver_name = ?, updated_at = ?
          WHERE id = ?
        `).bind(next.stage, next.no, next.name, now, overtimeId).run()
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
    const leave = await env.DB.prepare(`
      SELECT * FROM leave_requests
      WHERE id = ? AND employee_no = ? AND status = 'pending'
    `).bind(leaveId, employeeNo).first()
    if (!leave) return jsonResponse({ ok: false, message: '查無此待審核假單，或無權限取消' }, 404)

    const now = getTaiwanTimeString()
    await env.DB.prepare(`
      UPDATE leave_requests
      SET status = 'cancelled',
          cancelled_by_no = ?,
          cancelled_by_name = (SELECT employee_name FROM employees WHERE employee_no = ?),
          cancel_reason = ?,
          cancelled_at = ?,
          updated_at = ?
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
    const hrEmpNo = getHrNo(env)
    if (hrNo !== hrEmpNo) return jsonResponse({ ok: false, message: '僅人資可作廢假單' }, 403)
    const leave = await env.DB.prepare(`
      SELECT * FROM leave_requests
      WHERE id = ? AND status NOT IN ('voided', 'cancelled')
    `).bind(leaveId).first()
    if (!leave) return jsonResponse({ ok: false, message: '查無此假單，或已作廢/取消無法再次作廢' }, 404)

    const now = getTaiwanTimeString()
    await env.DB.prepare(`
      UPDATE leave_requests
      SET status = 'voided',
          voided_by_no = ?,
          voided_by_name = (SELECT employee_name FROM employees WHERE employee_no = ?),
          void_reason = ?,
          updated_at = ?
      WHERE id = ?
    `).bind(hrNo, hrNo, voidReason, now, leaveId).run()
    return jsonResponse({ ok: true, message: '假單已作廢' })
  }

  // ----- HR 報表 -----
  if (method === 'GET' && path === '/api/hr/report') {
    const leaves = await env.DB.prepare(`SELECT * FROM leave_requests ORDER BY created_at DESC`).all()
    const punches = await env.DB.prepare(`SELECT * FROM punch_requests ORDER BY created_at DESC`).all()
    const overtimes = await env.DB.prepare(`SELECT * FROM overtime_requests ORDER BY created_at DESC`).all()
    return jsonResponse({
      ok: true,
      leaves: leaves.results,
      punches: punches.results,
      overtimes: overtimes.results
    })
  }

  // ----- 除錯路由 -----
  if (method === 'GET' && path === '/api/debug/db') {
    try {
      const countStmt = await env.DB.prepare('SELECT COUNT(*) as count FROM employees').first()
      const leaveCountStmt = await env.DB.prepare('SELECT COUNT(*) as count FROM leave_requests').first()
      return jsonResponse({
        ok: true,
        employees: countStmt?.count || 0,
        leave_requests: leaveCountStmt?.count || 0,
        message: '資料庫連線正常'
      })
    } catch (err) {
      return jsonResponse({ ok: false, error: err.message }, 500)
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
