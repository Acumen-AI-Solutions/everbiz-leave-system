import { useState } from 'react'
import './App.css'

type Employee = {
  name: string
  department: string
  position: string
  approval_level: number
  manager: string
}

type CurrentUser = {
  employee_no: string
  name: string
  department: string
  position: string
  approval_level: number
  manager_employee_no: string
  system_role: string
  is_active: number
}

type LeaveResult = {
  employeeNo: string
  employeeName: string
  department: string
  position: string
  approvalLevel: number
  leaveType: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  totalHours: number
  reason: string
  currentApproverNo: string
  currentApproverName: string
  leaveRequestId?: number
}

type LeaveRecord = {
  id: number
  employee_no: string
  employee_name: string
  leave_type: string
  start_date: string
  start_time?: string
  end_date: string
  end_time?: string
  total_hours?: number
  reason: string
  status: string
  current_approver_no: string
  current_approver_name: string
  created_at: string
  updated_at: string
}

type PunchRecord = {
  id: number
  employee_no: string
  employee_name: string
  punch_type: string
  punch_date: string
  punch_time: string
  reason: string
  status: string
  current_approver_no: string
  current_approver_name: string
  created_at: string
  updated_at: string
}

type OvertimeRecord = {
  id: number
  employee_no: string
  employee_name: string
  overtime_type: string
  overtime_date: string
  start_time: string
  end_time: string
  total_hours: number
  reason: string
  status: string
  current_approver_no: string
  current_approver_name: string
  created_at: string
  updated_at: string
}

type FormType = 'leave' | 'punch' | 'overtime'
type SectionType = 'form' | 'approvals' | 'hr'

const employees: Record<string, Employee> = {
  E001: { name: '王小明', department: '工程部', position: '工程師', approval_level: 1, manager: 'E010' },
  E010: { name: '陳主任', department: '工程部', position: '主任',  approval_level: 2, manager: 'E020' },
  E020: { name: '林經理', department: '工程部', position: '經理',  approval_level: 3, manager: 'E100' },
  E100: { name: '張總經理', department: '總經理室', position: '總經理', approval_level: 5, manager: '' },
  E900: { name: '人資管理員', department: '人資部', position: 'HR', approval_level: 4, manager: 'E100' },
}

const timeOptions = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
  '20:00', '20:30', '21:00', '21:30', '22:00',
]

function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

function dateToLocal(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

function calculateLeaveHours(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
): number {
  if (!startDate || !endDate || !startTime || !endTime) return 0

  const workStart = timeToMinutes('08:00')
  const workEnd = timeToMinutes('17:00')
  const lunchStart = timeToMinutes('12:00')
  const lunchEnd = timeToMinutes('13:00')

  const start = dateToLocal(startDate)
  const end = dateToLocal(endDate)

  if (start > end) return 0

  let totalMinutes = 0
  const current = new Date(start)

  while (current <= end) {
    if (!isWeekend(current)) {
      const currentDate = formatDate(current)
      let dayStart = workStart
      let dayEnd = workEnd

      if (currentDate === startDate) dayStart = Math.max(dayStart, timeToMinutes(startTime))
      if (currentDate === endDate)   dayEnd   = Math.min(dayEnd,   timeToMinutes(endTime))

      let workMinutes = Math.max(0, dayEnd - dayStart)
      const lunchOverlap = Math.max(0, Math.min(dayEnd, lunchEnd) - Math.max(dayStart, lunchStart))
      workMinutes -= lunchOverlap
      totalMinutes += Math.max(0, workMinutes)
    }
    current.setDate(current.getDate() + 1)
  }

  return totalMinutes / 60
}

function calculateSimpleHours(startTime: string, endTime: string): number {
  return Math.max(0, timeToMinutes(endTime) - timeToMinutes(startTime)) / 60
}

function statusText(status: string) {
  if (status === 'pending')  return '待審核'
  if (status === 'approved') return '已核准'
  if (status === 'rejected') return '已駁回'
  return status
}

function App() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const [loginEmployeeNo, setLoginEmployeeNo] = useState('')
  const [pinCode, setPinCode]                 = useState('')
  const [currentUser, setCurrentUser]         = useState<CurrentUser | null>(null)
  const [loginError, setLoginError]           = useState('')
  const [isLoggingIn, setIsLoggingIn]         = useState(false)

  // ── Navigation ────────────────────────────────────────────────────────────
  const [activeForm, setActiveForm]       = useState<FormType>('leave')
  const [activeSection, setActiveSection] = useState<SectionType>('form')

  // ── Leave form ────────────────────────────────────────────────────────────
  const [employeeNo, setEmployeeNo]     = useState('')
  const [employeeName, setEmployeeName] = useState('')
  const [leaveType, setLeaveType]       = useState('特休')
  const [startDate, setStartDate]       = useState('')
  const [startTime, setStartTime]       = useState('08:00')
  const [endDate, setEndDate]           = useState('')
  const [endTime, setEndTime]           = useState('17:00')
  const [totalHours, setTotalHours]     = useState(8)
  const [reason, setReason]             = useState('')
  const [error, setError]               = useState('')
  const [result, setResult]             = useState<LeaveResult | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ── Punch form ────────────────────────────────────────────────────────────
  const [punchDate, setPunchDate]       = useState('')
  const [punchType, setPunchType]       = useState('上班補卡')
  const [punchTime, setPunchTime]       = useState('08:00')
  const [punchReason, setPunchReason]   = useState('')
  const [punchMessage, setPunchMessage] = useState('')

  // ── Overtime form ─────────────────────────────────────────────────────────
  const [overtimeDate, setOvertimeDate]     = useState('')
  const [overtimeStart, setOvertimeStart]   = useState('17:30')
  const [overtimeEnd, setOvertimeEnd]       = useState('19:30')
  const [overtimeType, setOvertimeType]     = useState('平日加班')
  const [overtimeReason, setOvertimeReason] = useState('')
  const [overtimeMessage, setOvertimeMessage] = useState('')

  // ── Approvals ─────────────────────────────────────────────────────────────
  const [approverNo, setApproverNo]             = useState('')
  const [pendingLeaves, setPendingLeaves]         = useState<LeaveRecord[]>([])
  const [pendingPunches, setPendingPunches]       = useState<PunchRecord[]>([])
  const [pendingOvertimes, setPendingOvertimes]   = useState<OvertimeRecord[]>([])
  const [approvalMessage, setApprovalMessage]   = useState('')
  const [isLoadingApprovals, setIsLoadingApprovals] = useState(false)

  // ── My leaves ─────────────────────────────────────────────────────────────
  const [myLeaves, setMyLeaves]             = useState<LeaveRecord[]>([])
  const [myLeaveMessage, setMyLeaveMessage] = useState('')
  const [isLoadingMyLeaves, setIsLoadingMyLeaves] = useState(false)

  // ── HR report ─────────────────────────────────────────────────────────────
  const [hrLeaves, setHrLeaves]     = useState<LeaveRecord[]>([])
  const [hrMessage, setHrMessage]   = useState('')
  const [isLoadingHrLeaves, setIsLoadingHrLeaves] = useState(false)

  // ── Derived permissions ───────────────────────────────────────────────────
  const canApprove =
    currentUser?.system_role === 'manager' ||
    currentUser?.system_role === 'general_manager' ||
    currentUser?.system_role === 'hr'

  const canViewHrReport =
    currentUser?.system_role === 'hr' ||
    currentUser?.system_role === 'general_manager'

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedEmployeeNo = loginEmployeeNo.trim().toUpperCase()
    const normalizedPinCode    = pinCode.trim()

    if (!normalizedEmployeeNo || !normalizedPinCode) {
      setLoginError('請輸入員工編號與 PIN Code')
      return
    }

    setIsLoggingIn(true)
    setLoginError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_no: normalizedEmployeeNo, pin_code: normalizedPinCode }),
      })
      const data = await response.json()

      if (!data.ok) {
        setLoginError(data.message || '登入失敗')
        setCurrentUser(null)
        return
      }

      setCurrentUser(data.user)
      setEmployeeNo(data.user.employee_no)
      setEmployeeName(data.user.name)
      setApproverNo(data.user.employee_no)
      setLoginError('')
      setError('')
      setApprovalMessage('')
      setMyLeaveMessage('')
      setHrMessage('')
      setPendingLeaves([])
      setPendingPunches([])
      setPendingOvertimes([])
      setMyLeaves([])
      setHrLeaves([])
      setResult(null)
      setPunchMessage('')
      setOvertimeMessage('')
      setActiveSection('form')
    } catch {
      setLoginError('登入失敗，請確認 /api/auth/login 是否已建立')
      setCurrentUser(null)
    } finally {
      setIsLoggingIn(false)
    }
  }

  function handleLogout() {
    setCurrentUser(null)
    setLoginEmployeeNo('')
    setPinCode('')
    setEmployeeNo('')
    setEmployeeName('')
    setApproverNo('')
    setPendingLeaves([])
    setPendingPunches([])
    setPendingOvertimes([])
    setMyLeaves([])
    setHrLeaves([])
    setApprovalMessage('')
    setMyLeaveMessage('')
    setHrMessage('')
    setResult(null)
    setError('')
    setPunchMessage('')
    setOvertimeMessage('')
    setActiveSection('form')
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedEmployeeNo   = employeeNo.trim().toUpperCase()
    const normalizedEmployeeName = employeeName.trim()

    if (!normalizedEmployeeNo || !normalizedEmployeeName) {
      setError('請輸入員工編號與姓名')
      setResult(null)
      return
    }
    if (!startDate || !endDate) {
      setError('請選擇開始日期與結束日期')
      setResult(null)
      return
    }
    if (totalHours <= 0) {
      setError('請假時數必須大於 0，請確認開始時間與結束時間')
      setResult(null)
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/leave/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_no: normalizedEmployeeNo,
          name: normalizedEmployeeName,
          leave_type: leaveType,
          start_date: startDate,
          start_time: startTime,
          end_date: endDate,
          end_time: endTime,
          total_hours: totalHours,
          reason,
        }),
      })

      const data = await response.json()

      if (!data.ok) {
        setError(data.message || '請假單送出失敗')
        setResult(null)
        return
      }

      const employee = employees[normalizedEmployeeNo]

      setResult({
        employeeNo: normalizedEmployeeNo,
        employeeName: normalizedEmployeeName,
        department:    employee?.department    || currentUser?.department    || '由資料庫判斷',
        position:      employee?.position      || currentUser?.position      || '由資料庫判斷',
        approvalLevel: employee?.approval_level ?? currentUser?.approval_level ?? 0,
        leaveType,
        startDate,
        startTime,
        endDate,
        endTime,
        totalHours,
        reason,
        currentApproverNo:   data.current_approver_no,
        currentApproverName: data.current_approver_name,
        leaveRequestId:      data.leave_request_id,
      })

      setReason('')
      setError('')
      await loadMyLeavesSilent()
    } catch {
      setError('送出失敗，請確認後端 API 是否正常')
      setResult(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handlePunchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!punchDate || !punchTime || !punchReason.trim()) {
      setPunchMessage('請填寫補卡日期、補卡時間與補卡原因')
      return
    }

    try {
      const response = await fetch('/api/punch/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_no: employeeNo,
          name: employeeName,
          punch_type: punchType,
          punch_date: punchDate,
          punch_time: punchTime,
          reason: punchReason,
        }),
      })

      const data = await response.json()

      if (!data.ok) {
        setPunchMessage(data.message || '補卡申請送出失敗')
        return
      }

      setPunchMessage(`補卡申請已送出，等待 ${data.current_approver_name} / ${data.current_approver_no} 審核。`)
      setPunchReason('')
    } catch {
      setPunchMessage('補卡申請送出失敗，請確認 /api/punch/create 是否正常')
    }
  }

  async function handleOvertimeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const overtimeHours = calculateSimpleHours(overtimeStart, overtimeEnd)

    if (!overtimeDate || overtimeHours <= 0 || !overtimeReason.trim()) {
      setOvertimeMessage('請填寫加班日期、正確時間與加班原因')
      return
    }

    try {
      const response = await fetch('/api/overtime/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_no: employeeNo,
          name: employeeName,
          overtime_type: overtimeType,
          overtime_date: overtimeDate,
          start_time: overtimeStart,
          end_time: overtimeEnd,
          total_hours: overtimeHours,
          reason: overtimeReason,
        }),
      })

      const data = await response.json()

      if (!data.ok) {
        setOvertimeMessage(data.message || '加班申請送出失敗')
        return
      }

      setOvertimeMessage(`加班申請已送出，等待 ${data.current_approver_name} / ${data.current_approver_no} 審核。`)
      setOvertimeReason('')
    } catch {
      setOvertimeMessage('加班申請送出失敗，請確認 /api/overtime/create 是否正常')
    }
  }

  async function loadPendingApprovals() {
    const normalizedApproverNo = approverNo.trim().toUpperCase()
    if (!normalizedApproverNo) {
      setApprovalMessage('請輸入主管工號')
      return
    }

    setIsLoadingApprovals(true)
    setApprovalMessage('查詢中...')

    try {
      const response = await fetch(
        `/api/approvals/pending?approver_no=${encodeURIComponent(normalizedApproverNo)}`,
      )
      const data = await response.json()

      if (!data.ok) {
        setApprovalMessage(data.message || '查詢待審核資料失敗')
        setPendingLeaves([])
        setPendingPunches([])
        setPendingOvertimes([])
        return
      }

      setPendingLeaves(data.leaves || [])
      setPendingPunches(data.punches || [])
      setPendingOvertimes(data.overtimes || [])

      const leaveCount    = data.leaves?.length    || 0
      const punchCount    = data.punches?.length   || 0
      const overtimeCount = data.overtimes?.length || 0

      setApprovalMessage(`已載入 ${leaveCount} 筆假單、${punchCount} 筆補卡、${overtimeCount} 筆加班待審核`)
    } catch {
      setApprovalMessage('查詢失敗，請確認 API 是否正常')
      setPendingLeaves([])
      setPendingPunches([])
      setPendingOvertimes([])
    } finally {
      setIsLoadingApprovals(false)
    }
  }

  async function handleApprovalAction(leaveRequestId: number, action: 'approved' | 'rejected') {
    const normalizedApproverNo = approverNo.trim().toUpperCase()
    if (!normalizedApproverNo) {
      setApprovalMessage('請輸入主管工號')
      return
    }

    const actionText = action === 'approved' ? '核准' : '駁回'
    if (!window.confirm(`確定要${actionText}這張假單嗎？`)) return

    setApprovalMessage(`${actionText}處理中...`)

    try {
      const response = await fetch('/api/approvals/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leave_request_id:     leaveRequestId,
          approver_employee_no: normalizedApproverNo,
          action,
          comment: action === 'approved' ? '同意' : '駁回',
        }),
      })
      const data = await response.json()

      if (!data.ok) {
        setApprovalMessage(data.message || '審核失敗')
        return
      }

      setApprovalMessage(data.message || `${actionText}完成`)
      await loadPendingApprovals()
      await loadMyLeavesSilent()
      if (canViewHrReport) await loadHrLeavesSilent()
    } catch {
      setApprovalMessage('審核失敗，請確認 API 是否正常')
    }
  }

  async function handlePunchApprovalAction(punchRequestId: number, action: 'approved' | 'rejected') {
    const normalizedApproverNo = approverNo.trim().toUpperCase()
    if (!normalizedApproverNo) {
      setApprovalMessage('請輸入主管工號')
      return
    }

    const actionText = action === 'approved' ? '核准' : '駁回'
    if (!window.confirm(`確定要${actionText}這張補卡單嗎？`)) return

    setApprovalMessage(`補卡${actionText}處理中...`)

    try {
      const response = await fetch('/api/punch/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          punch_request_id:     punchRequestId,
          approver_employee_no: normalizedApproverNo,
          action,
          comment: action === 'approved' ? '同意補卡' : '駁回補卡',
        }),
      })

      const data = await response.json()

      if (!data.ok) {
        setApprovalMessage(data.message || '補卡審核失敗')
        return
      }

      setApprovalMessage(data.message || `補卡${actionText}完成`)
      await loadPendingApprovals()
    } catch {
      setApprovalMessage('補卡審核失敗，請確認 /api/punch/action 是否正常')
    }
  }

  // FIX #1: Added missing handleOvertimeApprovalAction
  async function handleOvertimeApprovalAction(overtimeRequestId: number, action: 'approved' | 'rejected') {
    const normalizedApproverNo = approverNo.trim().toUpperCase()
    if (!normalizedApproverNo) {
      setApprovalMessage('請輸入主管工號')
      return
    }

    const actionText = action === 'approved' ? '核准' : '駁回'
    if (!window.confirm(`確定要${actionText}這張加班單嗎？`)) return

    setApprovalMessage(`加班${actionText}處理中...`)

    try {
      const response = await fetch('/api/overtime/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overtime_request_id:  overtimeRequestId,
          approver_employee_no: normalizedApproverNo,
          action,
          comment: action === 'approved' ? '同意加班' : '駁回加班',
        }),
      })

      const data = await response.json()

      if (!data.ok) {
        setApprovalMessage(data.message || '加班審核失敗')
        return
      }

      setApprovalMessage(data.message || `加班${actionText}完成`)
      await loadPendingApprovals()
    } catch {
      setApprovalMessage('加班審核失敗，請確認 /api/overtime/action 是否正常')
    }
  }

  async function loadMyLeavesSilent() {
    if (!currentUser) return
    try {
      const response = await fetch(`/api/leave/my?employee_no=${encodeURIComponent(currentUser.employee_no)}`)
      const data = await response.json()
      if (data.ok) setMyLeaves(data.leaves || [])
    } catch { /* silent */ }
  }

  async function loadMyLeaves() {
    if (!currentUser) return
    setIsLoadingMyLeaves(true)
    setMyLeaveMessage('查詢中...')
    try {
      const response = await fetch(`/api/leave/my?employee_no=${encodeURIComponent(currentUser.employee_no)}`)
      const data = await response.json()
      if (!data.ok) {
        setMyLeaveMessage(data.message || '查詢我的假單失敗')
        setMyLeaves([])
        return
      }
      setMyLeaves(data.leaves || [])
      setMyLeaveMessage(`已載入 ${data.leaves?.length || 0} 筆我的假單`)
    } catch {
      setMyLeaveMessage('查詢失敗，請確認 /api/leave/my 是否已建立')
      setMyLeaves([])
    } finally {
      setIsLoadingMyLeaves(false)
    }
  }

  async function loadHrLeavesSilent() {
    try {
      const response = await fetch('/api/hr/leaves')
      const data = await response.json()
      if (data.ok) setHrLeaves(data.leaves || [])
    } catch { /* silent */ }
  }

  async function loadHrLeaves() {
    setIsLoadingHrLeaves(true)
    setHrMessage('查詢中...')
    try {
      const response = await fetch('/api/hr/leaves')
      const data = await response.json()
      if (!data.ok) {
        setHrMessage(data.message || '查詢 HR 報表失敗')
        setHrLeaves([])
        return
      }
      setHrLeaves(data.leaves || [])
      setHrMessage(`已載入 ${data.leaves?.length || 0} 筆全部假單`)
    } catch {
      setHrMessage('查詢失敗，請確認 API 是否正常')
      setHrLeaves([])
    } finally {
      setIsLoadingHrLeaves(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <nav className="top-nav">
        <div className="brand">
          <img src="https://pub-531c96b02ed745e0bbfd0e96bfde8518.r2.dev/EBC.png" alt="EBC" />
          <div>
            <strong>Everbiz</strong>
            <small>Leave Management</small>
          </div>
        </div>

        {/* FIX #3: Added onClick handlers to nav buttons */}
        {currentUser && (
          <div className="menu">
            <button type="button" onClick={() => { setActiveSection('form'); setActiveForm('leave') }}>請假申請</button>
            <button type="button" onClick={() => { setActiveSection('form'); setActiveForm('punch') }}>補卡申請</button>
            <button type="button" onClick={() => { setActiveSection('form'); setActiveForm('overtime') }}>加班申請</button>
            {canApprove      && <button type="button" onClick={() => setActiveSection('approvals')}>待審核</button>}
            {canViewHrReport && <button type="button" onClick={() => setActiveSection('hr')}>HR報表</button>}
            <button type="button" onClick={handleLogout}>登出</button>
          </div>
        )}
      </nav>

      {/* ── Login ── */}
      {!currentUser && (
        <section className="card login-card">
          <h2>身分確認</h2>
          {loginError && <div className="alert">{loginError}</div>}
          <form onSubmit={handleLogin}>
            <input
              value={loginEmployeeNo}
              onChange={(e) => setLoginEmployeeNo(e.target.value)}
              placeholder="員工編號，例如 E010"
            />
            <input
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value)}
              placeholder="PIN Code，例如 E010"
              type="password"
            />
            <button className="submit-btn" type="submit" disabled={isLoggingIn}>
              {isLoggingIn ? '登入中...' : '進入系統'}
            </button>
          </form>
          <p className="small">
            測試階段 PIN Code 與員工編號相同，例如 E001 / E001、E010 / E010、E900 / E900。
          </p>
        </section>
      )}

      {/* ── Authenticated ── */}
      {currentUser && (
        <>
          {/* Current user banner */}
          <section className="card user-card">
            <h2>目前登入</h2>
            <div className="summary">
              <div><span>員工</span><strong>{currentUser.employee_no} {currentUser.name}</strong></div>
              <div><span>部門</span><strong>{currentUser.department}</strong></div>
              <div><span>職稱</span><strong>{currentUser.position}</strong></div>
              <div><span>角色</span><strong>{currentUser.system_role}</strong></div>
              <div><span>簽核層級</span><strong>{currentUser.approval_level}</strong></div>
            </div>
          </section>

          <header className="hero">
            <div className="hero-left">
              <div className="logo-wrap">
                <img src="https://pub-531c96b02ed745e0bbfd0e96bfde8518.r2.dev/EBC.png" alt="EBC" />
              </div>
              <p className="eyebrow">EVERBIZ INTERNAL HR SYSTEM</p>
              <h1>人資申請系統 Demo</h1>
              <p>請假、補卡、加班申請已串接 D1 Database，並進入主管簽核流程。</p>
            </div>
            <div className="badge">PWA</div>
          </header>

          {/* ── Form section ── */}
          {activeSection === 'form' && (
            <>
              <section className="card result-card">
                <h2>申請類型</h2>
                <div className="form-tabs">
                  <button className={activeForm === 'leave'    ? 'active' : ''} type="button" onClick={() => setActiveForm('leave')}>請假申請</button>
                  <button className={activeForm === 'punch'    ? 'active' : ''} type="button" onClick={() => setActiveForm('punch')}>補卡申請</button>
                  <button className={activeForm === 'overtime' ? 'active' : ''} type="button" onClick={() => setActiveForm('overtime')}>加班申請</button>
                </div>
              </section>

              <div className="grid">
                {/* Application forms */}
                <section className="card">
                  {activeForm === 'leave' && (
                    <>
                      <h2>請假申請</h2>
                      {error && <div className="alert">{error}</div>}
                      <form onSubmit={handleSubmit}>
                        <input value={employeeNo} readOnly placeholder="員工編號" />
                        <input value={employeeName} readOnly placeholder="姓名" />

                        <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                          <option>特休</option>
                          <option>事假</option>
                          <option>病假</option>
                          <option>公假</option>
                          <option>補休</option>
                        </select>

                        <div className="two">
                          <input
                            type="date"
                            value={startDate}
                            onChange={(e) => {
                              const value = e.target.value
                              setStartDate(value)
                              setTotalHours(calculateLeaveHours(value, startTime, endDate, endTime))
                            }}
                          />
                          <select
                            value={startTime}
                            onChange={(e) => {
                              setStartTime(e.target.value)
                              setTotalHours(calculateLeaveHours(startDate, e.target.value, endDate, endTime))
                            }}
                          >
                            {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>

                        <div className="two">
                          <input
                            type="date"
                            value={endDate}
                            onChange={(e) => {
                              const value = e.target.value
                              setEndDate(value)
                              setTotalHours(calculateLeaveHours(startDate, startTime, value, endTime))
                            }}
                          />
                          <select
                            value={endTime}
                            onChange={(e) => {
                              setEndTime(e.target.value)
                              setTotalHours(calculateLeaveHours(startDate, startTime, endDate, e.target.value))
                            }}
                          >
                            {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>

                        <div className="note-box">請假時數：{totalHours} 小時</div>

                        <textarea
                          rows={5}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="請假原因"
                        />

                        <button className="submit-btn" type="submit" disabled={isSubmitting}>
                          {isSubmitting ? '送出中...' : '送出假單'}
                        </button>
                      </form>
                    </>
                  )}

                  {activeForm === 'punch' && (
                    <>
                      <h2>補卡申請</h2>
                      {punchMessage && <div className="note-box">{punchMessage}</div>}
                      <form onSubmit={handlePunchSubmit}>
                        <input value={employeeNo} readOnly placeholder="員工編號" />
                        <input value={employeeName} readOnly placeholder="姓名" />

                        <select value={punchType} onChange={(e) => setPunchType(e.target.value)}>
                          <option>上班補卡</option>
                          <option>下班補卡</option>
                          <option>上下班補卡</option>
                          <option>外出返廠補卡</option>
                        </select>

                        <div className="two">
                          <input type="date" value={punchDate} onChange={(e) => setPunchDate(e.target.value)} />
                          <select value={punchTime} onChange={(e) => setPunchTime(e.target.value)}>
                            {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>

                        <textarea
                          rows={5}
                          value={punchReason}
                          onChange={(e) => setPunchReason(e.target.value)}
                          placeholder="補卡原因，例如忘記刷卡、卡機異常、外出公務"
                        />

                        <div className="note-box">簽核流程：部門主管 → 人資單位</div>

                        <button className="submit-btn" type="submit">送出補卡申請</button>
                      </form>
                    </>
                  )}

                  {activeForm === 'overtime' && (
                    <>
                      <h2>加班申請</h2>
                      {overtimeMessage && <div className="note-box">{overtimeMessage}</div>}
                      <form onSubmit={handleOvertimeSubmit}>
                        <input value={employeeNo} readOnly placeholder="員工編號" />
                        <input value={employeeName} readOnly placeholder="姓名" />

                        <select value={overtimeType} onChange={(e) => setOvertimeType(e.target.value)}>
                          <option>平日加班</option>
                          <option>休息日加班</option>
                          <option>例假日加班</option>
                          <option>國定假日加班</option>
                        </select>

                        <input type="date" value={overtimeDate} onChange={(e) => setOvertimeDate(e.target.value)} />

                        <div className="two">
                          <select value={overtimeStart} onChange={(e) => setOvertimeStart(e.target.value)}>
                            {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <select value={overtimeEnd} onChange={(e) => setOvertimeEnd(e.target.value)}>
                            {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>

                        <div className="note-box">加班時數：{calculateSimpleHours(overtimeStart, overtimeEnd)} 小時</div>

                        <textarea
                          rows={5}
                          value={overtimeReason}
                          onChange={(e) => setOvertimeReason(e.target.value)}
                          placeholder="加班原因 / 工作內容"
                        />

                        <div className="note-box">
                          簽核流程依區域判斷：辦公區為部門主管 → 董事長 → 人資；廠務區依製造/生管流程加簽。
                        </div>

                        <button className="submit-btn" type="submit">送出加班申請</button>
                      </form>
                    </>
                  )}
                </section>

                {/* Employee table */}
                <section className="card">
                  <h2>員工資料</h2>
                  <table>
                    <thead>
                      <tr><th>編號</th><th>姓名</th><th>職稱</th><th>Level</th></tr>
                    </thead>
                    <tbody>
                      {Object.entries(employees).map(([id, emp]) => (
                        <tr key={id}>
                          <td>{id}</td>
                          <td>{emp.name}</td>
                          <td>{emp.position}</td>
                          <td>{emp.approval_level}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>

              {/* Submit result */}
              {result && (
                <section className="card result-card">
                  <h2>假單送出結果</h2>
                  <div className="summary">
                    <div><span>假單編號</span><strong>{result.leaveRequestId || '-'}</strong></div>
                    <div><span>員工</span><strong>{result.employeeNo} {result.employeeName}</strong></div>
                    <div><span>假別</span><strong>{result.leaveType}</strong></div>
                    <div>
                      <span>期間</span>
                      <strong>{result.startDate} {result.startTime} ~ {result.endDate} {result.endTime}</strong>
                    </div>
                    <div><span>時數</span><strong>{result.totalHours} 小時</strong></div>
                    <div>
                      <span>目前審核主管</span>
                      <strong>{result.currentApproverName} / {result.currentApproverNo}</strong>
                    </div>
                  </div>
                  <p className="small">假單已寫入 D1 資料庫，主管可在「主管待審核」區查詢並核准或駁回。</p>
                </section>
              )}

              {/* My leaves */}
              <section className="card result-card">
                <h2>我的假單</h2>
                <button className="submit-btn" type="button" onClick={loadMyLeaves} disabled={isLoadingMyLeaves}>
                  {isLoadingMyLeaves ? '查詢中...' : '查詢我的假單'}
                </button>
                {myLeaveMessage && <div className="note-box">{myLeaveMessage}</div>}
                {myLeaves.length === 0 ? (
                  <p className="small">目前沒有請假紀錄。</p>
                ) : (
                  <div className="approval-list">
                    {myLeaves.map((leave) => (
                      <div className="approval-item" key={leave.id}>
                        <div>
                          <strong>#{leave.id}｜{leave.leave_type}｜{statusText(leave.status)}</strong>
                          <p>日期：{leave.start_date} {leave.start_time || ''} ~ {leave.end_date} {leave.end_time || ''}</p>
                          <p>時數：{leave.total_hours ?? '-'} 小時</p>
                          <p>原因：{leave.reason || '未填寫'}</p>
                          <p>審核主管：{leave.current_approver_name} / {leave.current_approver_no}</p>
                          <p>建立時間：{leave.created_at}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {/* ── Approvals section (manager/HR only) ── */}
          {activeSection === 'approvals' && canApprove && (
            <section className="card result-card">
              <h2>主管待審核</h2>
              <div className="approval-search">
                <input value={approverNo} readOnly placeholder="主管工號，例如 E010" />
                <button
                  className="submit-btn"
                  type="button"
                  onClick={loadPendingApprovals}
                  disabled={isLoadingApprovals}
                >
                  {isLoadingApprovals ? '查詢中...' : '查詢待審核'}
                </button>
              </div>
              {approvalMessage && <div className="note-box">{approvalMessage}</div>}

              {pendingLeaves.length === 0 && pendingPunches.length === 0 && pendingOvertimes.length === 0 && (
                <p className="small">目前沒有待審核資料。</p>
              )}

              {/* FIX #2: Pending leaves — independent block */}
              {pendingLeaves.length > 0 && (
                <>
                  <h3>待審核假單</h3>
                  <div className="approval-list">
                    {pendingLeaves.map((leave) => (
                      <div className="approval-item" key={leave.id}>
                        <div>
                          <strong>#{leave.id}｜{leave.employee_no} {leave.employee_name}</strong>
                          <p>{leave.leave_type}｜{leave.start_date} {leave.start_time || ''} ~ {leave.end_date} {leave.end_time || ''}</p>
                          <p>時數：{leave.total_hours ?? '-'} 小時</p>
                          <p>原因：{leave.reason || '未填寫'}</p>
                          <p>狀態：{statusText(leave.status)}</p>
                          <p>目前審核：{leave.current_approver_name} / {leave.current_approver_no}</p>
                        </div>
                        <div className="approval-actions">
                          <button type="button" className="approve-btn" onClick={() => handleApprovalAction(leave.id, 'approved')}>核准</button>
                          <button type="button" className="reject-btn"  onClick={() => handleApprovalAction(leave.id, 'rejected')}>駁回</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* FIX #2: Pending punches — independent block */}
              {pendingPunches.length > 0 && (
                <>
                  <h3>待審核補卡</h3>
                  <div className="approval-list">
                    {pendingPunches.map((punch) => (
                      <div className="approval-item" key={`punch-${punch.id}`}>
                        <div>
                          <strong>補卡 #{punch.id}｜{punch.employee_no} {punch.employee_name}</strong>
                          <p>{punch.punch_type}｜{punch.punch_date} {punch.punch_time}</p>
                          <p>原因：{punch.reason || '未填寫'}</p>
                          <p>狀態：{statusText(punch.status)}</p>
                          <p>目前審核：{punch.current_approver_name} / {punch.current_approver_no}</p>
                          <p>建立時間：{punch.created_at}</p>
                        </div>
                        <div className="approval-actions">
                          <button type="button" className="approve-btn" onClick={() => handlePunchApprovalAction(punch.id, 'approved')}>核准</button>
                          <button type="button" className="reject-btn"  onClick={() => handlePunchApprovalAction(punch.id, 'rejected')}>駁回</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* FIX #2: Pending overtimes — independent block (was nested inside punch map) */}
              {pendingOvertimes.length > 0 && (
                <>
                  <h3>待審核加班</h3>
                  <div className="approval-list">
                    {pendingOvertimes.map((overtime) => (
                      <div className="approval-item" key={`overtime-${overtime.id}`}>
                        <div>
                          <strong>加班 #{overtime.id}｜{overtime.employee_no} {overtime.employee_name}</strong>
                          <p>{overtime.overtime_type}｜{overtime.overtime_date}</p>
                          <p>時間：{overtime.start_time} ~ {overtime.end_time}</p>
                          <p>時數：{overtime.total_hours ?? '-'} 小時</p>
                          <p>原因：{overtime.reason || '未填寫'}</p>
                          <p>狀態：{statusText(overtime.status)}</p>
                          <p>目前審核：{overtime.current_approver_name} / {overtime.current_approver_no}</p>
                          <p>建立時間：{overtime.created_at}</p>
                        </div>
                        <div className="approval-actions">
                          {/* FIX #1: Now calls the handler that actually exists */}
                          <button type="button" className="approve-btn" onClick={() => handleOvertimeApprovalAction(overtime.id, 'approved')}>核准</button>
                          <button type="button" className="reject-btn"  onClick={() => handleOvertimeApprovalAction(overtime.id, 'rejected')}>駁回</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {/* ── HR report section ── */}
          {activeSection === 'hr' && canViewHrReport && (
            <section className="card result-card">
              <h2>HR 全部請假資料</h2>
              <button className="submit-btn" type="button" onClick={loadHrLeaves} disabled={isLoadingHrLeaves}>
                {isLoadingHrLeaves ? '查詢中...' : '查詢全部假單'}
              </button>
              {hrMessage && <div className="note-box">{hrMessage}</div>}
              {hrLeaves.length === 0 ? (
                <p className="small">目前沒有請假資料。</p>
              ) : (
                <div className="approval-list">
                  {hrLeaves.map((leave) => (
                    <div className="approval-item" key={leave.id}>
                      <div>
                        <strong>#{leave.id}｜{leave.employee_no} {leave.employee_name}｜{statusText(leave.status)}</strong>
                        <p>{leave.leave_type}｜{leave.start_date} {leave.start_time || ''} ~ {leave.end_date} {leave.end_time || ''}</p>
                        <p>時數：{leave.total_hours ?? '-'} 小時</p>
                        <p>原因：{leave.reason || '未填寫'}</p>
                        <p>審核主管：{leave.current_approver_name} / {leave.current_approver_no}</p>
                        <p>建立時間：{leave.created_at}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}

export default App
