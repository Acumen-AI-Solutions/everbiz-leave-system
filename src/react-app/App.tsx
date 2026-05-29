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
type Lang = 'zh' | 'en' | 'vi'

// ── i18n helper ────────────────────────────────────────────────────────────
function t(lang: Lang, zh: string, en: string, vi: string): string {
  if (lang === 'en') return en
  if (lang === 'vi') return vi
  return zh
}

// ── Static data ────────────────────────────────────────────────────────────
const employees: Record<string, Employee> = {
  E001: { name: '王小明',   department: '工程部',   position: '工程師', approval_level: 1, manager: 'E010' },
  E010: { name: '陳主任',   department: '工程部',   position: '主任',   approval_level: 2, manager: 'E020' },
  E020: { name: '林經理',   department: '工程部',   position: '經理',   approval_level: 3, manager: 'E100' },
  E100: { name: '陳董事長', department: '董事長室', position: '董事長', approval_level: 5, manager: ''    },
  E200: { name: '財務長',   department: '財務部',   position: '財務長', approval_level: 5, manager: 'E100' },
  E900: { name: '人資管理員', department: '人資部', position: 'HR',     approval_level: 4, manager: 'E100' },
}

const timeOptions = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
  '20:00', '20:30', '21:00', '21:30', '22:00',
]

// ── Utility functions ──────────────────────────────────────────────────────
function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

function dateToLocal(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDate(date: Date): string {
  const year  = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day   = String(date.getDate()).padStart(2, '0')
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

  const workStart  = timeToMinutes('08:00')
  const workEnd    = timeToMinutes('17:00')
  const lunchStart = timeToMinutes('12:00')
  const lunchEnd   = timeToMinutes('13:00')

  const start = dateToLocal(startDate)
  const end   = dateToLocal(endDate)

  if (start > end) return 0

  let totalMinutes = 0
  const current = new Date(start)

  while (current <= end) {
    if (!isWeekend(current)) {
      const currentDate = formatDate(current)
      let dayStart = workStart
      let dayEnd   = workEnd

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

function statusText(status: string, lang: Lang) {
  if (status === 'pending')  return t(lang, '待審核', 'Pending',   'Chờ duyệt')
  if (status === 'approved') return t(lang, '已核准', 'Approved',  'Đã duyệt')
  if (status === 'rejected') return t(lang, '已駁回', 'Rejected',  'Đã từ chối')
  return status
}

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

// ── App ────────────────────────────────────────────────────────────────────
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
  const [lang, setLang]                   = useState<Lang>('zh')

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
  const [overtimeDate, setOvertimeDate]       = useState('')
  const [overtimeStart, setOvertimeStart]     = useState('17:30')
  const [overtimeEnd, setOvertimeEnd]         = useState('19:30')
  const [overtimeType, setOvertimeType]       = useState('平日加班')
  const [overtimeReason, setOvertimeReason]   = useState('')
  const [overtimeMessage, setOvertimeMessage] = useState('')

  // ── Approvals ─────────────────────────────────────────────────────────────
  const [approverNo, setApproverNo]             = useState('')
  const [pendingLeaves, setPendingLeaves]       = useState<LeaveRecord[]>([])
  const [pendingPunches, setPendingPunches]     = useState<PunchRecord[]>([])
  const [pendingOvertimes, setPendingOvertimes] = useState<OvertimeRecord[]>([])
  const [approvalMessage, setApprovalMessage]   = useState('')
  const [isLoadingApprovals, setIsLoadingApprovals] = useState(false)

  // ── My leaves ─────────────────────────────────────────────────────────────
  const [myLeaves, setMyLeaves]             = useState<LeaveRecord[]>([])
  const [myLeaveMessage, setMyLeaveMessage] = useState('')
  const [isLoadingMyLeaves, setIsLoadingMyLeaves] = useState(false)

  // ── HR report ─────────────────────────────────────────────────────────────
  const [hrLeaves, setHrLeaves] = useState<LeaveRecord[]>([])
  const [hrPunches, setHrPunches] = useState<PunchRecord[]>([])
  const [hrOvertimes, setHrOvertimes] = useState<OvertimeRecord[]>([])
  const [hrMessage, setHrMessage] = useState('')
  const [isLoadingHrLeaves, setIsLoadingHrLeaves] = useState(false)

  // ── Derived permissions ───────────────────────────────────────────────────
  const canApprove =
    currentUser?.system_role === 'manager' ||
    currentUser?.system_role === 'general_manager' ||
    currentUser?.system_role === 'hr'

  const canViewHrReport =
    currentUser?.system_role === 'hr' ||
    currentUser?.system_role === 'general_manager' ||
    currentUser?.system_role === 'finance'

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedEmployeeNo = loginEmployeeNo.trim().toUpperCase()
    const normalizedPinCode    = pinCode.trim()

    if (!normalizedEmployeeNo || !normalizedPinCode) {
      setLoginError(t(lang, '請輸入員工編號與 PIN Code', 'Please enter employee number and PIN Code', 'Vui lòng nhập mã nhân viên và mã PIN'))
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
        setLoginError(data.message || t(lang, '登入失敗', 'Login failed', 'Đăng nhập thất bại'))
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
      setLoginError(t(lang,
        '登入失敗，請確認 /api/auth/login 是否已建立',
        'Login failed. Please check whether /api/auth/login exists.',
        'Đăng nhập thất bại. Vui lòng kiểm tra /api/auth/login.',
      ))
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
      setError(t(lang, '請輸入員工編號與姓名', 'Please enter employee number and name', 'Vui lòng nhập mã nhân viên và tên'))
      setResult(null)
      return
    }
    if (!startDate || !endDate) {
      setError(t(lang, '請選擇開始日期與結束日期', 'Please select start and end dates', 'Vui lòng chọn ngày bắt đầu và kết thúc'))
      setResult(null)
      return
    }
    if (totalHours <= 0) {
      setError(t(lang, '請假時數必須大於 0，請確認開始時間與結束時間', 'Leave hours must be greater than 0. Please check the start and end times.', 'Số giờ nghỉ phải lớn hơn 0. Vui lòng kiểm tra giờ bắt đầu và kết thúc.'))
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
        setError(data.message || t(lang, '請假單送出失敗', 'Failed to submit leave request', 'Gửi đơn nghỉ phép thất bại'))
        setResult(null)
        return
      }

      const employee = employees[normalizedEmployeeNo]

      setResult({
        employeeNo:          normalizedEmployeeNo,
        employeeName:        normalizedEmployeeName,
        department:          employee?.department    || currentUser?.department    || t(lang, '由資料庫判斷', 'From database', 'Từ cơ sở dữ liệu'),
        position:            employee?.position      || currentUser?.position      || t(lang, '由資料庫判斷', 'From database', 'Từ cơ sở dữ liệu'),
        approvalLevel:       employee?.approval_level ?? currentUser?.approval_level ?? 0,
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
      setError(t(lang, '送出失敗，請確認後端 API 是否正常', 'Submission failed. Please check the backend API.', 'Gửi thất bại. Vui lòng kiểm tra API backend.'))
      setResult(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handlePunchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!punchDate || !punchTime || !punchReason.trim()) {
      setPunchMessage(t(lang, '請填寫補卡日期、補卡時間與補卡原因', 'Please fill in the punch date, time, and reason', 'Vui lòng điền ngày, giờ và lý do bổ sung chấm công'))
      return
    }

    try {
      const response = await fetch('/api/punch/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_no: employeeNo,
          name:        employeeName,
          punch_type:  punchType,
          punch_date:  punchDate,
          punch_time:  punchTime,
          reason:      punchReason,
        }),
      })

      const data = await response.json()

      if (!data.ok) {
        setPunchMessage(data.message || t(lang, '補卡申請送出失敗', 'Failed to submit punch correction', 'Gửi đơn bổ sung chấm công thất bại'))
        return
      }

      setPunchMessage(t(lang,
        `補卡申請已送出，等待 ${data.current_approver_name} / ${data.current_approver_no} 審核。`,
        `Punch correction submitted. Awaiting approval from ${data.current_approver_name} / ${data.current_approver_no}.`,
        `Đơn bổ sung chấm công đã gửi. Chờ duyệt từ ${data.current_approver_name} / ${data.current_approver_no}.`,
      ))
      setPunchReason('')
    } catch {
      setPunchMessage(t(lang, '補卡申請送出失敗，請確認 /api/punch/create 是否正常', 'Submission failed. Please check /api/punch/create.', 'Gửi thất bại. Vui lòng kiểm tra /api/punch/create.'))
    }
  }

  async function handleOvertimeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const overtimeHours = calculateSimpleHours(overtimeStart, overtimeEnd)

    if (!overtimeDate || overtimeHours <= 0 || !overtimeReason.trim()) {
      setOvertimeMessage(t(lang, '請填寫加班日期、正確時間與加班原因', 'Please fill in the overtime date, valid times, and reason', 'Vui lòng điền ngày, giờ hợp lệ và lý do tăng ca'))
      return
    }

    try {
      const response = await fetch('/api/overtime/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_no:   employeeNo,
          name:          employeeName,
          overtime_type: overtimeType,
          overtime_date: overtimeDate,
          start_time:    overtimeStart,
          end_time:      overtimeEnd,
          total_hours:   overtimeHours,
          reason:        overtimeReason,
        }),
      })

      const data = await response.json()

      if (!data.ok) {
        setOvertimeMessage(data.message || t(lang, '加班申請送出失敗', 'Failed to submit overtime request', 'Gửi đơn tăng ca thất bại'))
        return
      }

      setOvertimeMessage(t(lang,
        `加班申請已送出，等待 ${data.current_approver_name} / ${data.current_approver_no} 審核。`,
        `Overtime request submitted. Awaiting approval from ${data.current_approver_name} / ${data.current_approver_no}.`,
        `Đơn tăng ca đã gửi. Chờ duyệt từ ${data.current_approver_name} / ${data.current_approver_no}.`,
      ))
      setOvertimeReason('')
    } catch {
      setOvertimeMessage(t(lang, '加班申請送出失敗，請確認 /api/overtime/create 是否正常', 'Submission failed. Please check /api/overtime/create.', 'Gửi thất bại. Vui lòng kiểm tra /api/overtime/create.'))
    }
  }

  async function loadPendingApprovals() {
    const normalizedApproverNo = approverNo.trim().toUpperCase()
    if (!normalizedApproverNo) {
      setApprovalMessage(t(lang, '請輸入主管工號', 'Please enter manager employee number', 'Vui lòng nhập mã nhân viên quản lý'))
      return
    }

    setIsLoadingApprovals(true)
    setApprovalMessage(t(lang, '查詢中...', 'Loading...', 'Đang tải...'))

    try {
      const response = await fetch(
        `/api/approvals/pending?approver_no=${encodeURIComponent(normalizedApproverNo)}`,
      )
      const data = await response.json()

      if (!data.ok) {
        setApprovalMessage(data.message || t(lang, '查詢待審核資料失敗', 'Failed to load pending approvals', 'Tải dữ liệu chờ duyệt thất bại'))
        setPendingLeaves([])
        setPendingPunches([])
        setPendingOvertimes([])
        return
      }

      setPendingLeaves(data.leaves      || [])
      setPendingPunches(data.punches    || [])
      setPendingOvertimes(data.overtimes || [])

      const leaveCount    = data.leaves?.length    || 0
      const punchCount    = data.punches?.length   || 0
      const overtimeCount = data.overtimes?.length || 0

      setApprovalMessage(t(lang,
        `已載入 ${leaveCount} 筆假單、${punchCount} 筆補卡、${overtimeCount} 筆加班待審核`,
        `Loaded ${leaveCount} leave(s), ${punchCount} punch(es), ${overtimeCount} overtime(s) pending approval`,
        `Đã tải ${leaveCount} đơn nghỉ, ${punchCount} đơn chấm công, ${overtimeCount} đơn tăng ca chờ duyệt`,
      ))
    } catch {
      setApprovalMessage(t(lang, '查詢失敗，請確認 API 是否正常', 'Query failed. Please check the API.', 'Truy vấn thất bại. Vui lòng kiểm tra API.'))
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
      setApprovalMessage(t(lang, '請輸入主管工號', 'Please enter manager employee number', 'Vui lòng nhập mã nhân viên quản lý'))
      return
    }

    const actionText = action === 'approved'
      ? t(lang, '核准', 'Approve', 'Duyệt')
      : t(lang, '駁回', 'Reject', 'Từ chối')

    if (!window.confirm(t(lang, `確定要${actionText}這張假單嗎？`, `Are you sure you want to ${actionText.toLowerCase()} this leave request?`, `Bạn có chắc muốn ${actionText.toLowerCase()} đơn nghỉ phép này không?`))) return

    setApprovalMessage(t(lang, `${actionText}處理中...`, 'Processing...', 'Đang xử lý...'))

    try {
      const response = await fetch('/api/approvals/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leave_request_id:     leaveRequestId,
          approver_employee_no: normalizedApproverNo,
          action,
          comment: action === 'approved'
            ? t(lang, '同意', 'Approved', 'Đồng ý')
            : t(lang, '駁回', 'Rejected', 'Từ chối'),
        }),
      })
      const data = await response.json()

      if (!data.ok) {
        setApprovalMessage(data.message || t(lang, '審核失敗', 'Approval failed', 'Phê duyệt thất bại'))
        return
      }

      setApprovalMessage(data.message || t(lang, `${actionText}完成`, `${actionText} complete`, `Hoàn tất ${actionText}`))
      await loadPendingApprovals()
      await loadMyLeavesSilent()
      if (canViewHrReport) await loadHrLeavesSilent()
    } catch {
      setApprovalMessage(t(lang, '審核失敗，請確認 API 是否正常', 'Approval failed. Please check the API.', 'Phê duyệt thất bại. Vui lòng kiểm tra API.'))
    }
  }

  async function handlePunchApprovalAction(punchRequestId: number, action: 'approved' | 'rejected') {
    const normalizedApproverNo = approverNo.trim().toUpperCase()
    if (!normalizedApproverNo) {
      setApprovalMessage(t(lang, '請輸入主管工號', 'Please enter manager employee number', 'Vui lòng nhập mã nhân viên quản lý'))
      return
    }

    const actionText = action === 'approved'
      ? t(lang, '核准', 'Approve', 'Duyệt')
      : t(lang, '駁回', 'Reject', 'Từ chối')

    if (!window.confirm(t(lang, `確定要${actionText}這張補卡單嗎？`, `Are you sure you want to ${actionText.toLowerCase()} this punch correction?`, `Bạn có chắc muốn ${actionText.toLowerCase()} đơn chấm công này không?`))) return

    setApprovalMessage(t(lang, `補卡${actionText}處理中...`, 'Processing...', 'Đang xử lý...'))

    try {
      const response = await fetch('/api/punch/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          punch_request_id:     punchRequestId,
          approver_employee_no: normalizedApproverNo,
          action,
          comment: action === 'approved'
            ? t(lang, '同意補卡', 'Punch correction approved', 'Đồng ý bổ sung chấm công')
            : t(lang, '駁回補卡', 'Punch correction rejected', 'Từ chối bổ sung chấm công'),
        }),
      })

      const data = await response.json()

      if (!data.ok) {
        setApprovalMessage(data.message || t(lang, '補卡審核失敗', 'Punch approval failed', 'Phê duyệt chấm công thất bại'))
        return
      }

      setApprovalMessage(data.message || t(lang, `補卡${actionText}完成`, `Punch correction ${actionText.toLowerCase()} complete`, `Hoàn tất ${actionText} chấm công`))
      await loadPendingApprovals()
    } catch {
      setApprovalMessage(t(lang, '補卡審核失敗，請確認 /api/punch/action 是否正常', 'Punch approval failed. Please check /api/punch/action.', 'Phê duyệt thất bại. Vui lòng kiểm tra /api/punch/action.'))
    }
  }

  async function handleOvertimeApprovalAction(overtimeRequestId: number, action: 'approved' | 'rejected') {
    const normalizedApproverNo = approverNo.trim().toUpperCase()
    if (!normalizedApproverNo) {
      setApprovalMessage(t(lang, '請輸入主管工號', 'Please enter manager employee number', 'Vui lòng nhập mã nhân viên quản lý'))
      return
    }

    const actionText = action === 'approved'
      ? t(lang, '核准', 'Approve', 'Duyệt')
      : t(lang, '駁回', 'Reject', 'Từ chối')

    if (!window.confirm(t(lang, `確定要${actionText}這張加班單嗎？`, `Are you sure you want to ${actionText.toLowerCase()} this overtime request?`, `Bạn có chắc muốn ${actionText.toLowerCase()} đơn tăng ca này không?`))) return

    setApprovalMessage(t(lang, `加班${actionText}處理中...`, 'Processing...', 'Đang xử lý...'))

    try {
      const response = await fetch('/api/overtime/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overtime_request_id:  overtimeRequestId,
          approver_employee_no: normalizedApproverNo,
          action,
          comment: action === 'approved'
            ? t(lang, '同意加班', 'Overtime approved', 'Đồng ý tăng ca')
            : t(lang, '駁回加班', 'Overtime rejected', 'Từ chối tăng ca'),
        }),
      })

      const data = await response.json()

      if (!data.ok) {
        setApprovalMessage(data.message || t(lang, '加班審核失敗', 'Overtime approval failed', 'Phê duyệt tăng ca thất bại'))
        return
      }

      setApprovalMessage(data.message || t(lang, `加班${actionText}完成`, `Overtime ${actionText.toLowerCase()} complete`, `Hoàn tất ${actionText} tăng ca`))
      await loadPendingApprovals()
    } catch {
      setApprovalMessage(t(lang, '加班審核失敗，請確認 /api/overtime/action 是否正常', 'Overtime approval failed. Please check /api/overtime/action.', 'Phê duyệt thất bại. Vui lòng kiểm tra /api/overtime/action.'))
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
    setMyLeaveMessage(t(lang, '查詢中...', 'Loading...', 'Đang tải...'))
    try {
      const response = await fetch(`/api/leave/my?employee_no=${encodeURIComponent(currentUser.employee_no)}`)
      const data = await response.json()
      if (!data.ok) {
        setMyLeaveMessage(data.message || t(lang, '查詢我的假單失敗', 'Failed to load my leave requests', 'Tải đơn nghỉ phép thất bại'))
        setMyLeaves([])
        return
      }
      setMyLeaves(data.leaves || [])
      setMyLeaveMessage(t(lang,
        `已載入 ${data.leaves?.length || 0} 筆我的假單`,
        `Loaded ${data.leaves?.length || 0} leave request(s)`,
        `Đã tải ${data.leaves?.length || 0} đơn nghỉ phép`,
      ))
    } catch {
      setMyLeaveMessage(t(lang, '查詢失敗，請確認 /api/leave/my 是否已建立', 'Query failed. Please check /api/leave/my.', 'Truy vấn thất bại. Vui lòng kiểm tra /api/leave/my.'))
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

  async function loadHrReport() {
  setIsLoadingHrLeaves(true)
  setHrMessage(t(lang, '查詢中...', 'Loading...', 'Đang tải...'))

  try {
    const response = await fetch('/api/hr/report')
    const data = await response.json()

    if (!data.ok) {
      setHrMessage(data.message || t(lang, '查詢 HR 報表失敗', 'Failed to load HR report', 'Tải báo cáo nhân sự thất bại'))
      setHrLeaves([])
      setHrPunches([])
      setHrOvertimes([])
      return
    }

    setHrLeaves(data.leaves || [])
    setHrPunches(data.punches || [])
    setHrOvertimes(data.overtimes || [])

    setHrMessage(t(
      lang,
      `已載入 ${data.leaves?.length || 0} 筆請假、${data.punches?.length || 0} 筆補卡/忘刷、${data.overtimes?.length || 0} 筆加班`,
      `Loaded ${data.leaves?.length || 0} leave, ${data.punches?.length || 0} punch, ${data.overtimes?.length || 0} overtime records`,
      `Đã tải ${data.leaves?.length || 0} đơn nghỉ, ${data.punches?.length || 0} đơn chấm công, ${data.overtimes?.length || 0} đơn tăng ca`,
    ))
  } catch {
    setHrMessage(t(lang, '查詢失敗，請確認 API 是否正常', 'Query failed. Please check the API.', 'Truy vấn thất bại. Vui lòng kiểm tra API.'))
    setHrLeaves([])
    setHrPunches([])
    setHrOvertimes([])
  } finally {
    setIsLoadingHrLeaves(false)
  }
}

  function exportHrLeavesCsv() {
    if (hrLeaves.length === 0) {
      setHrMessage(t(lang, '目前沒有資料可以匯出，請先查詢全部假單', 'No data to export. Please load all leave records first.', 'Không có dữ liệu để xuất. Vui lòng tải tất cả bản ghi trước.'))
      return
    }

    function exportHrPunchesCsv() {
  if (hrPunches.length === 0) {
    setHrMessage(t(lang, '目前沒有補卡 / 忘刷資料可以匯出', 'No punch correction data to export.', 'Không có dữ liệu chấm công để xuất.'))
    return
  }

  const headers = [
    t(lang, '補卡編號', 'ID', 'Mã đơn'),
    t(lang, '員工編號', 'Employee No.', 'Mã NV'),
    t(lang, '姓名', 'Name', 'Tên'),
    t(lang, '補卡類型', 'Punch Type', 'Loại chấm công'),
    t(lang, '補卡日期', 'Punch Date', 'Ngày chấm công'),
    t(lang, '補卡時間', 'Punch Time', 'Giờ chấm công'),
    t(lang, '原因', 'Reason', 'Lý do'),
    t(lang, '狀態', 'Status', 'Trạng thái'),
    t(lang, '審核主管編號', 'Approver No.', 'Mã quản lý'),
    t(lang, '審核主管姓名', 'Approver Name', 'Tên quản lý'),
    t(lang, '建立時間', 'Created At', 'Thời gian tạo'),
    t(lang, '更新時間', 'Updated At', 'Thời gian cập nhật'),
  ]

  const rows = hrPunches.map((punch) => [
    punch.id,
    punch.employee_no,
    punch.employee_name,
    punch.punch_type,
    punch.punch_date,
    punch.punch_time,
    punch.reason || '',
    statusText(punch.status, lang),
    punch.current_approver_no,
    punch.current_approver_name,
    punch.created_at,
    punch.updated_at,
  ])

  const csvContent = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
  ].join('\r\n')

  const bom = '\uFEFF'
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const today = new Date().toISOString().slice(0, 10)

  link.href = url
  link.download = `HR_${t(lang, '補卡忘刷報表', 'Punch_Report', 'Bao_cao_cham_cong')}_${today}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  setHrMessage(t(lang,
    `已匯出 ${hrPunches.length} 筆補卡 / 忘刷報表`,
    `Exported ${hrPunches.length} punch correction record(s)`,
    `Đã xuất ${hrPunches.length} bản ghi chấm công`,
  ))
}

function exportHrOvertimesCsv() {
  if (hrOvertimes.length === 0) {
    setHrMessage(t(lang, '目前沒有加班資料可以匯出', 'No overtime data to export.', 'Không có dữ liệu tăng ca để xuất.'))
    return
  }

  const headers = [
    t(lang, '加班編號', 'ID', 'Mã đơn'),
    t(lang, '員工編號', 'Employee No.', 'Mã NV'),
    t(lang, '姓名', 'Name', 'Tên'),
    t(lang, '加班類型', 'Overtime Type', 'Loại tăng ca'),
    t(lang, '加班日期', 'Overtime Date', 'Ngày tăng ca'),
    t(lang, '開始時間', 'Start Time', 'Giờ bắt đầu'),
    t(lang, '結束時間', 'End Time', 'Giờ kết thúc'),
    t(lang, '時數', 'Hours', 'Số giờ'),
    t(lang, '原因', 'Reason', 'Lý do'),
    t(lang, '狀態', 'Status', 'Trạng thái'),
    t(lang, '審核主管編號', 'Approver No.', 'Mã quản lý'),
    t(lang, '審核主管姓名', 'Approver Name', 'Tên quản lý'),
    t(lang, '建立時間', 'Created At', 'Thời gian tạo'),
    t(lang, '更新時間', 'Updated At', 'Thời gian cập nhật'),
  ]

  const rows = hrOvertimes.map((overtime) => [
    overtime.id,
    overtime.employee_no,
    overtime.employee_name,
    overtime.overtime_type,
    overtime.overtime_date,
    overtime.start_time,
    overtime.end_time,
    overtime.total_hours ?? '',
    overtime.reason || '',
    statusText(overtime.status, lang),
    overtime.current_approver_no,
    overtime.current_approver_name,
    overtime.created_at,
    overtime.updated_at,
  ])

  const csvContent = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
  ].join('\r\n')

  const bom = '\uFEFF'
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const today = new Date().toISOString().slice(0, 10)

  link.href = url
  link.download = `HR_${t(lang, '加班報表', 'Overtime_Report', 'Bao_cao_tang_ca')}_${today}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  setHrMessage(t(lang,
    `已匯出 ${hrOvertimes.length} 筆加班報表`,
    `Exported ${hrOvertimes.length} overtime record(s)`,
    `Đã xuất ${hrOvertimes.length} bản ghi tăng ca`,
  ))
}

    const headers = [
      t(lang, '假單編號', 'ID', 'Mã đơn'),
      t(lang, '員工編號', 'Employee No.', 'Mã NV'),
      t(lang, '姓名', 'Name', 'Tên'),
      t(lang, '假別', 'Leave Type', 'Loại nghỉ'),
      t(lang, '開始日期', 'Start Date', 'Ngày bắt đầu'),
      t(lang, '開始時間', 'Start Time', 'Giờ bắt đầu'),
      t(lang, '結束日期', 'End Date', 'Ngày kết thúc'),
      t(lang, '結束時間', 'End Time', 'Giờ kết thúc'),
      t(lang, '時數', 'Hours', 'Số giờ'),
      t(lang, '原因', 'Reason', 'Lý do'),
      t(lang, '狀態', 'Status', 'Trạng thái'),
      t(lang, '審核主管編號', 'Approver No.', 'Mã quản lý'),
      t(lang, '審核主管姓名', 'Approver Name', 'Tên quản lý'),
      t(lang, '建立時間', 'Created At', 'Thời gian tạo'),
      t(lang, '更新時間', 'Updated At', 'Thời gian cập nhật'),
    ]

    const rows = hrLeaves.map((leave) => [
      leave.id,
      leave.employee_no,
      leave.employee_name,
      leave.leave_type,
      leave.start_date,
      leave.start_time || '',
      leave.end_date,
      leave.end_time || '',
      leave.total_hours ?? '',
      leave.reason || '',
      statusText(leave.status, lang),
      leave.current_approver_no,
      leave.current_approver_name,
      leave.created_at,
      leave.updated_at,
    ])

    const csvContent = [
      headers.map(csvCell).join(','),
      ...rows.map((row) => row.map(csvCell).join(',')),
    ].join('\r\n')

    const bom  = '\uFEFF'
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const today = new Date().toISOString().slice(0, 10)

    link.href     = url
    link.download = `HR_${t(lang, '請假報表', 'Leave_Report', 'Bao_cao_nghi_phep')}_${today}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    setHrMessage(t(lang,
      `已匯出 ${hrLeaves.length} 筆請假報表`,
      `Exported ${hrLeaves.length} leave record(s)`,
      `Đã xuất ${hrLeaves.length} bản ghi nghỉ phép`,
    ))
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

        {currentUser && (
          <div className="menu">
            <button type="button" onClick={() => { setActiveSection('form'); setActiveForm('leave') }}>
              {t(lang, '請假申請', 'Leave Request', 'Đơn nghỉ phép')}
            </button>
            <button type="button" onClick={() => { setActiveSection('form'); setActiveForm('punch') }}>
              {t(lang, '補卡申請', 'Punch Correction', 'Bổ sung chấm công')}
            </button>
            <button type="button" onClick={() => { setActiveSection('form'); setActiveForm('overtime') }}>
              {t(lang, '加班申請', 'Overtime Request', 'Đơn tăng ca')}
            </button>
            {canApprove && (
              <button type="button" onClick={() => setActiveSection('approvals')}>
                {t(lang, '待審核', 'Pending Approval', 'Chờ duyệt')}
              </button>
            )}
            {canViewHrReport && (
              <button type="button" onClick={() => setActiveSection('hr')}>
                {t(lang, 'HR報表', 'HR Report', 'Báo cáo nhân sự')}
              </button>
            )}
            <button type="button" onClick={handleLogout}>
              {t(lang, '登出', 'Logout', 'Đăng xuất')}
            </button>
          </div>
        )}
      </nav>

      {/* ── Login ── */}
      {!currentUser && (
        <section className="card login-card">
          <div className="language-row">
            <label>{t(lang, '語言', 'Language', 'Ngôn ngữ')}</label>
            <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
              <option value="zh">中文</option>
              <option value="en">English</option>
              <option value="vi">Tiếng Việt</option>
            </select>
          </div>

          <h2>{t(lang, '身分確認', 'Identity Verification', 'Xác minh danh tính')}</h2>
          {loginError && <div className="alert">{loginError}</div>}
          <form onSubmit={handleLogin}>
            <input
              value={loginEmployeeNo}
              onChange={(e) => setLoginEmployeeNo(e.target.value)}
              placeholder={t(lang, '員工編號，例如 E010', 'Employee No., e.g. E010', 'Mã nhân viên, ví dụ E010')}
            />
            <input
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value)}
              placeholder={t(lang, 'PIN Code，例如 E010', 'PIN Code, e.g. E010', 'Mã PIN, ví dụ E010')}
              type="password"
            />
            <button className="submit-btn" type="submit" disabled={isLoggingIn}>
              {isLoggingIn
                ? t(lang, '登入中...', 'Logging in...', 'Đang đăng nhập...')
                : t(lang, '進入系統', 'Enter System', 'Vào hệ thống')}
            </button>
          </form>
          <p className="small">
            {t(lang,
              '測試階段 PIN Code 與員工編號相同，例如 E001 / E001、E010 / E010、E900 / E900。',
              'During testing, PIN Code equals the employee number, e.g. E001 / E001, E010 / E010, E900 / E900.',
              'Trong giai đoạn thử nghiệm, mã PIN giống mã nhân viên, ví dụ E001 / E001, E010 / E010, E900 / E900.',
            )}
          </p>
        </section>
      )}

      {/* ── Authenticated ── */}
      {currentUser && (
        <>
          {/* Current user banner */}
          <section className="card user-card">
            <h2>{t(lang, '目前登入', 'Current User', 'Người dùng hiện tại')}</h2>
            <div className="summary">
              <div><span>{t(lang, '員工', 'Employee', 'Nhân viên')}</span><strong>{currentUser.employee_no} {currentUser.name}</strong></div>
              <div><span>{t(lang, '部門', 'Department', 'Bộ phận')}</span><strong>{currentUser.department}</strong></div>
              <div><span>{t(lang, '職稱', 'Position', 'Chức vụ')}</span><strong>{currentUser.position}</strong></div>
              <div><span>{t(lang, '角色', 'Role', 'Vai trò')}</span><strong>{currentUser.system_role}</strong></div>
              <div><span>{t(lang, '簽核層級', 'Approval Level', 'Cấp phê duyệt')}</span><strong>{currentUser.approval_level}</strong></div>
            </div>
          </section>

          <header className="hero">
            <div className="hero-left">
              <div className="logo-wrap">
                <img src="https://pub-531c96b02ed745e0bbfd0e96bfde8518.r2.dev/EBC.png" alt="EBC" />
              </div>
              <p className="eyebrow">EVERBIZ INTERNAL HR SYSTEM</p>
              <h1>{t(lang, '人資申請系統 Demo', 'HR Request System Demo', 'Hệ thống yêu cầu nhân sự Demo')}</h1>
              <p>{t(lang,
                '請假、補卡、加班申請已串接 D1 Database，並進入主管簽核流程。',
                'Leave, punch correction, and overtime requests are connected to D1 Database and the manager approval workflow.',
                'Đơn nghỉ phép, bổ sung chấm công và tăng ca đã kết nối D1 Database và quy trình phê duyệt.',
              )}</p>
            </div>
            <div className="badge">PWA</div>
          </header>

          {/* ── Form section ── */}
          {activeSection === 'form' && (
            <>
              <section className="card result-card">
                <h2>{t(lang, '申請類型', 'Request Type', 'Loại đơn')}</h2>
                <div className="form-tabs">
                  <button className={activeForm === 'leave'    ? 'active' : ''} type="button" onClick={() => setActiveForm('leave')}>
                    {t(lang, '請假申請', 'Leave Request', 'Đơn nghỉ phép')}
                  </button>
                  <button className={activeForm === 'punch'    ? 'active' : ''} type="button" onClick={() => setActiveForm('punch')}>
                    {t(lang, '補卡申請', 'Punch Correction', 'Bổ sung chấm công')}
                  </button>
                  <button className={activeForm === 'overtime' ? 'active' : ''} type="button" onClick={() => setActiveForm('overtime')}>
                    {t(lang, '加班申請', 'Overtime Request', 'Đơn tăng ca')}
                  </button>
                </div>
              </section>

              <div className="grid">
                {/* Application forms */}
                <section className="card">
                  {activeForm === 'leave' && (
                    <>
                      <h2>{t(lang, '請假申請', 'Leave Request', 'Đơn nghỉ phép')}</h2>
                      {error && <div className="alert">{error}</div>}
                      <form onSubmit={handleSubmit}>
                        <input value={employeeNo}   readOnly placeholder={t(lang, '員工編號', 'Employee No.', 'Mã nhân viên')} />
                        <input value={employeeName} readOnly placeholder={t(lang, '姓名', 'Name', 'Tên')} />

                        <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                          <option>{t(lang, '特休', 'Annual Leave', 'Nghỉ phép năm')}</option>
                          <option>{t(lang, '事假', 'Personal Leave', 'Nghỉ việc riêng')}</option>
                          <option>{t(lang, '病假', 'Sick Leave', 'Nghỉ ốm')}</option>
                          <option>{t(lang, '公假', 'Official Leave', 'Nghỉ công vụ')}</option>
                          <option>{t(lang, '補休', 'Compensatory Leave', 'Nghỉ bù')}</option>
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

                        <div className="note-box">
                          {t(lang, `請假時數：${totalHours} 小時`, `Leave hours: ${totalHours} hr(s)`, `Số giờ nghỉ: ${totalHours} giờ`)}
                        </div>

                        <textarea
                          rows={5}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder={t(lang, '請假原因', 'Reason for leave', 'Lý do nghỉ phép')}
                        />

                        <button className="submit-btn" type="submit" disabled={isSubmitting}>
                          {isSubmitting
                            ? t(lang, '送出中...', 'Submitting...', 'Đang gửi...')
                            : t(lang, '送出假單', 'Submit Leave Request', 'Gửi đơn nghỉ phép')}
                        </button>
                      </form>
                    </>
                  )}

                  {activeForm === 'punch' && (
                    <>
                      <h2>{t(lang, '補卡申請', 'Punch Correction', 'Bổ sung chấm công')}</h2>
                      {punchMessage && <div className="note-box">{punchMessage}</div>}
                      <form onSubmit={handlePunchSubmit}>
                        <input value={employeeNo}   readOnly placeholder={t(lang, '員工編號', 'Employee No.', 'Mã nhân viên')} />
                        <input value={employeeName} readOnly placeholder={t(lang, '姓名', 'Name', 'Tên')} />

                        <select value={punchType} onChange={(e) => setPunchType(e.target.value)}>
                          <option>{t(lang, '上班補卡', 'Clock-in Correction', 'Bổ sung giờ vào')}</option>
                          <option>{t(lang, '下班補卡', 'Clock-out Correction', 'Bổ sung giờ ra')}</option>
                          <option>{t(lang, '上下班補卡', 'Both Clock-in/out Correction', 'Bổ sung cả vào và ra')}</option>
                          <option>{t(lang, '外出返廠補卡', 'Field Return Correction', 'Bổ sung sau công tác')}</option>
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
                          placeholder={t(lang, '補卡原因，例如忘記刷卡、卡機異常、外出公務', 'Reason, e.g. forgot to clock in, machine error, business trip', 'Lý do, ví dụ quên chấm công, máy lỗi, công tác')}
                        />

                        <div className="note-box">
                          {t(lang, '簽核流程：部門主管 → 人資單位', 'Approval flow: Dept. Manager → HR', 'Quy trình duyệt: Quản lý → Nhân sự')}
                        </div>

                        <button className="submit-btn" type="submit">
                          {t(lang, '送出補卡申請', 'Submit Punch Correction', 'Gửi đơn bổ sung chấm công')}
                        </button>
                      </form>
                    </>
                  )}

                  {activeForm === 'overtime' && (
                    <>
                      <h2>{t(lang, '加班申請', 'Overtime Request', 'Đơn tăng ca')}</h2>
                      {overtimeMessage && <div className="note-box">{overtimeMessage}</div>}
                      <form onSubmit={handleOvertimeSubmit}>
                        <input value={employeeNo}   readOnly placeholder={t(lang, '員工編號', 'Employee No.', 'Mã nhân viên')} />
                        <input value={employeeName} readOnly placeholder={t(lang, '姓名', 'Name', 'Tên')} />

                        <select value={overtimeType} onChange={(e) => setOvertimeType(e.target.value)}>
                          <option>{t(lang, '平日加班', 'Weekday Overtime', 'Tăng ca ngày thường')}</option>
                          <option>{t(lang, '休息日加班', 'Rest Day Overtime', 'Tăng ca ngày nghỉ')}</option>
                          <option>{t(lang, '例假日加班', 'Weekly Day-off Overtime', 'Tăng ca ngày nghỉ lễ')}</option>
                          <option>{t(lang, '國定假日加班', 'National Holiday Overtime', 'Tăng ca ngày quốc lễ')}</option>
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

                        <div className="note-box">
                          {t(lang,
                            `加班時數：${calculateSimpleHours(overtimeStart, overtimeEnd)} 小時`,
                            `Overtime hours: ${calculateSimpleHours(overtimeStart, overtimeEnd)} hr(s)`,
                            `Số giờ tăng ca: ${calculateSimpleHours(overtimeStart, overtimeEnd)} giờ`,
                          )}
                        </div>

                        <textarea
                          rows={5}
                          value={overtimeReason}
                          onChange={(e) => setOvertimeReason(e.target.value)}
                          placeholder={t(lang, '加班原因 / 工作內容', 'Reason / Work content', 'Lý do / Nội dung công việc')}
                        />

                        <div className="note-box">
                          {t(lang,
                            '簽核流程依區域判斷：辦公區為部門主管 → 董事長 → 人資；廠務區依製造/生管流程加簽。',
                            'Approval flow varies by area: Office — Dept. Manager → CEO → HR; Factory — per manufacturing/production flow.',
                            'Quy trình duyệt theo khu vực: Văn phòng — Quản lý → Giám đốc → Nhân sự; Xưởng — theo quy trình sản xuất.',
                          )}
                        </div>

                        <button className="submit-btn" type="submit">
                          {t(lang, '送出加班申請', 'Submit Overtime Request', 'Gửi đơn tăng ca')}
                        </button>
                      </form>
                    </>
                  )}
                </section>

                {/* Employee table */}
                <section className="card">
                  <h2>{t(lang, '員工資料', 'Employee Data', 'Thông tin nhân viên')}</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>{t(lang, '編號', 'No.', 'Mã')}</th>
                        <th>{t(lang, '姓名', 'Name', 'Tên')}</th>
                        <th>{t(lang, '職稱', 'Position', 'Chức vụ')}</th>
                        <th>Level</th>
                      </tr>
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
                  <h2>{t(lang, '假單送出結果', 'Leave Submission Result', 'Kết quả gửi đơn nghỉ phép')}</h2>
                  <div className="summary">
                    <div><span>{t(lang, '假單編號', 'Request ID', 'Mã đơn')}</span><strong>{result.leaveRequestId || '-'}</strong></div>
                    <div><span>{t(lang, '員工', 'Employee', 'Nhân viên')}</span><strong>{result.employeeNo} {result.employeeName}</strong></div>
                    <div><span>{t(lang, '假別', 'Leave Type', 'Loại nghỉ')}</span><strong>{result.leaveType}</strong></div>
                    <div>
                      <span>{t(lang, '期間', 'Period', 'Thời gian')}</span>
                      <strong>{result.startDate} {result.startTime} ~ {result.endDate} {result.endTime}</strong>
                    </div>
                    <div>
                      <span>{t(lang, '時數', 'Hours', 'Số giờ')}</span>
                      <strong>{result.totalHours} {t(lang, '小時', 'hr(s)', 'giờ')}</strong>
                    </div>
                    <div>
                      <span>{t(lang, '目前審核主管', 'Current Approver', 'Người phê duyệt')}</span>
                      <strong>{result.currentApproverName} / {result.currentApproverNo}</strong>
                    </div>
                  </div>
                  <p className="small">
                    {t(lang,
                      '假單已寫入 D1 資料庫，主管可在「待審核」區查詢並核准或駁回。',
                      'The leave request has been saved to D1 database. The manager can review, approve, or reject it in the approval section.',
                      'Đơn nghỉ phép đã được lưu vào D1 database. Quản lý có thể xem, duyệt hoặc từ chối trong mục chờ duyệt.',
                    )}
                  </p>
                </section>
              )}

              {/* My leaves */}
              <section className="card result-card">
                <h2>{t(lang, '我的假單', 'My Leave Requests', 'Đơn nghỉ phép của tôi')}</h2>
                <button className="submit-btn" type="button" onClick={loadMyLeaves} disabled={isLoadingMyLeaves}>
                  {isLoadingMyLeaves
                    ? t(lang, '查詢中...', 'Loading...', 'Đang tải...')
                    : t(lang, '查詢我的假單', 'Load My Leave Requests', 'Tải đơn nghỉ phép của tôi')}
                </button>
                {myLeaveMessage && <div className="note-box">{myLeaveMessage}</div>}
                {myLeaves.length === 0 ? (
                  <p className="small">{t(lang, '目前沒有請假紀錄。', 'No leave records found.', 'Không có bản ghi nghỉ phép.')}</p>
                ) : (
                  <div className="approval-list">
                    {myLeaves.map((leave) => (
                      <div className="approval-item" key={leave.id}>
                        <div>
                          <strong>#{leave.id}｜{leave.leave_type}｜{statusText(leave.status, lang)}</strong>
                          <p>{t(lang, '日期', 'Date', 'Ngày')}：{leave.start_date} {leave.start_time || ''} ~ {leave.end_date} {leave.end_time || ''}</p>
                          <p>{t(lang, '時數', 'Hours', 'Số giờ')}：{leave.total_hours ?? '-'} {t(lang, '小時', 'hr(s)', 'giờ')}</p>
                          <p>{t(lang, '原因', 'Reason', 'Lý do')}：{leave.reason || t(lang, '未填寫', 'N/A', 'Chưa điền')}</p>
                          <p>{t(lang, '審核主管', 'Approver', 'Người duyệt')}：{leave.current_approver_name} / {leave.current_approver_no}</p>
                          <p>{t(lang, '建立時間', 'Created At', 'Thời gian tạo')}：{leave.created_at}</p>
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
              <h2>{t(lang, '主管待審核', 'Manager Pending Approval', 'Quản lý chờ duyệt')}</h2>
              <div className="approval-search">
                <input value={approverNo} readOnly placeholder={t(lang, '主管工號，例如 E010', 'Manager No., e.g. E010', 'Mã quản lý, ví dụ E010')} />
                <button
                  className="submit-btn"
                  type="button"
                  onClick={loadPendingApprovals}
                  disabled={isLoadingApprovals}
                >
                  {isLoadingApprovals
                    ? t(lang, '查詢中...', 'Loading...', 'Đang tải...')
                    : t(lang, '查詢待審核', 'Load Pending', 'Tải danh sách chờ')}
                </button>
              </div>
              {approvalMessage && <div className="note-box">{approvalMessage}</div>}

              {pendingLeaves.length === 0 && pendingPunches.length === 0 && pendingOvertimes.length === 0 && (
                <p className="small">{t(lang, '目前沒有待審核資料。', 'No pending items.', 'Không có mục nào đang chờ duyệt.')}</p>
              )}

              {/* Pending leaves */}
              {pendingLeaves.length > 0 && (
                <>
                  <h3>{t(lang, '待審核假單', 'Pending Leave Requests', 'Đơn nghỉ phép chờ duyệt')}</h3>
                  <div className="approval-list">
                    {pendingLeaves.map((leave) => (
                      <div className="approval-item" key={leave.id}>
                        <div>
                          <strong>#{leave.id}｜{leave.employee_no} {leave.employee_name}</strong>
                          <p>{leave.leave_type}｜{leave.start_date} {leave.start_time || ''} ~ {leave.end_date} {leave.end_time || ''}</p>
                          <p>{t(lang, '時數', 'Hours', 'Số giờ')}：{leave.total_hours ?? '-'} {t(lang, '小時', 'hr(s)', 'giờ')}</p>
                          <p>{t(lang, '原因', 'Reason', 'Lý do')}：{leave.reason || t(lang, '未填寫', 'N/A', 'Chưa điền')}</p>
                          <p>{t(lang, '狀態', 'Status', 'Trạng thái')}：{statusText(leave.status, lang)}</p>
                          <p>{t(lang, '目前審核', 'Approver', 'Người duyệt')}：{leave.current_approver_name} / {leave.current_approver_no}</p>
                        </div>
                        <div className="approval-actions">
                          <button type="button" className="approve-btn" onClick={() => handleApprovalAction(leave.id, 'approved')}>
                            {t(lang, '核准', 'Approve', 'Duyệt')}
                          </button>
                          <button type="button" className="reject-btn" onClick={() => handleApprovalAction(leave.id, 'rejected')}>
                            {t(lang, '駁回', 'Reject', 'Từ chối')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Pending punches */}
              {pendingPunches.length > 0 && (
                <>
                  <h3>{t(lang, '待審核補卡', 'Pending Punch Corrections', 'Đơn chấm công chờ duyệt')}</h3>
                  <div className="approval-list">
                    {pendingPunches.map((punch) => (
                      <div className="approval-item" key={`punch-${punch.id}`}>
                        <div>
                          <strong>{t(lang, '補卡', 'Punch', 'Chấm công')} #{punch.id}｜{punch.employee_no} {punch.employee_name}</strong>
                          <p>{punch.punch_type}｜{punch.punch_date} {punch.punch_time}</p>
                          <p>{t(lang, '原因', 'Reason', 'Lý do')}：{punch.reason || t(lang, '未填寫', 'N/A', 'Chưa điền')}</p>
                          <p>{t(lang, '狀態', 'Status', 'Trạng thái')}：{statusText(punch.status, lang)}</p>
                          <p>{t(lang, '目前審核', 'Approver', 'Người duyệt')}：{punch.current_approver_name} / {punch.current_approver_no}</p>
                          <p>{t(lang, '建立時間', 'Created At', 'Thời gian tạo')}：{punch.created_at}</p>
                        </div>
                        <div className="approval-actions">
                          <button type="button" className="approve-btn" onClick={() => handlePunchApprovalAction(punch.id, 'approved')}>
                            {t(lang, '核准', 'Approve', 'Duyệt')}
                          </button>
                          <button type="button" className="reject-btn" onClick={() => handlePunchApprovalAction(punch.id, 'rejected')}>
                            {t(lang, '駁回', 'Reject', 'Từ chối')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Pending overtimes */}
              {pendingOvertimes.length > 0 && (
                <>
                  <h3>{t(lang, '待審核加班', 'Pending Overtime Requests', 'Đơn tăng ca chờ duyệt')}</h3>
                  <div className="approval-list">
                    {pendingOvertimes.map((overtime) => (
                      <div className="approval-item" key={`overtime-${overtime.id}`}>
                        <div>
                          <strong>{t(lang, '加班', 'OT', 'Tăng ca')} #{overtime.id}｜{overtime.employee_no} {overtime.employee_name}</strong>
                          <p>{overtime.overtime_type}｜{overtime.overtime_date}</p>
                          <p>{t(lang, '時間', 'Time', 'Thời gian')}：{overtime.start_time} ~ {overtime.end_time}</p>
                          <p>{t(lang, '時數', 'Hours', 'Số giờ')}：{overtime.total_hours ?? '-'} {t(lang, '小時', 'hr(s)', 'giờ')}</p>
                          <p>{t(lang, '原因', 'Reason', 'Lý do')}：{overtime.reason || t(lang, '未填寫', 'N/A', 'Chưa điền')}</p>
                          <p>{t(lang, '狀態', 'Status', 'Trạng thái')}：{statusText(overtime.status, lang)}</p>
                          <p>{t(lang, '目前審核', 'Approver', 'Người duyệt')}：{overtime.current_approver_name} / {overtime.current_approver_no}</p>
                          <p>{t(lang, '建立時間', 'Created At', 'Thời gian tạo')}：{overtime.created_at}</p>
                        </div>
                        <div className="approval-actions">
                          <button type="button" className="approve-btn" onClick={() => handleOvertimeApprovalAction(overtime.id, 'approved')}>
                            {t(lang, '核准', 'Approve', 'Duyệt')}
                          </button>
                          <button type="button" className="reject-btn" onClick={() => handleOvertimeApprovalAction(overtime.id, 'rejected')}>
                            {t(lang, '駁回', 'Reject', 'Từ chối')}
                          </button>
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
    <h2>{t(lang, 'HR 全部報表', 'All HR Reports', 'Tất cả báo cáo HR')}</h2>

    <div className="approval-search">
      <button
        className="submit-btn"
        type="button"
        onClick={loadHrReport}
        disabled={isLoadingHrLeaves}
      >
        {isLoadingHrLeaves
          ? t(lang, '查詢中...', 'Loading...', 'Đang tải...')
          : t(lang, '查詢全部報表', 'Load All Reports', 'Tải tất cả báo cáo')}
      </button>

      <button className="submit-btn" type="button" onClick={exportHrLeavesCsv}>
        {t(lang, '匯出請假報表', 'Export Leave CSV', 'Xuất nghỉ phép CSV')}
      </button>
    </div>

    {hrMessage && <div className="note-box">{hrMessage}</div>}

    {hrLeaves.length === 0 && hrPunches.length === 0 && hrOvertimes.length === 0 ? (
      <p className="small">
        {t(lang, '目前沒有 HR 報表資料。', 'No HR report records found.', 'Không có dữ liệu báo cáo HR.')}
      </p>
    ) : (
      <>
        {hrLeaves.length > 0 && (
          <>
            <h3>{t(lang, '請假報表', 'Leave Report', 'Báo cáo nghỉ phép')}</h3>
            <div className="approval-list">
              {hrLeaves.map((leave) => (
                <div className="approval-item" key={`hr-leave-${leave.id}`}>
                  <div>
                    <strong>
                      #{leave.id}｜{leave.employee_no} {leave.employee_name}｜{statusText(leave.status, lang)}
                    </strong>
                    <p>{leave.leave_type}｜{leave.start_date} {leave.start_time || ''} ~ {leave.end_date} {leave.end_time || ''}</p>
                    <p>{t(lang, '時數', 'Hours', 'Số giờ')}：{leave.total_hours ?? '-'} {t(lang, '小時', 'hr(s)', 'giờ')}</p>
                    <p>{t(lang, '原因', 'Reason', 'Lý do')}：{leave.reason || t(lang, '未填寫', 'N/A', 'Chưa điền')}</p>
                    <p>{t(lang, '審核主管', 'Approver', 'Người duyệt')}：{leave.current_approver_name} / {leave.current_approver_no}</p>
                    <p>{t(lang, '建立時間', 'Created At', 'Thời gian tạo')}：{leave.created_at}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {hrPunches.length > 0 && (
          <>
            <h3>{t(lang, '補卡 / 忘刷報表', 'Punch Correction Report', 'Báo cáo bổ sung chấm công')}</h3>
            <div className="approval-list">
              {hrPunches.map((punch) => (
                <div className="approval-item" key={`hr-punch-${punch.id}`}>
                  <div>
                    <strong>
                      #{punch.id}｜{punch.employee_no} {punch.employee_name}｜{statusText(punch.status, lang)}
                    </strong>
                    <p>{punch.punch_type}｜{punch.punch_date} {punch.punch_time}</p>
                    <p>{t(lang, '原因', 'Reason', 'Lý do')}：{punch.reason || t(lang, '未填寫', 'N/A', 'Chưa điền')}</p>
                    <p>{t(lang, '審核主管', 'Approver', 'Người duyệt')}：{punch.current_approver_name} / {punch.current_approver_no}</p>
                    <p>{t(lang, '建立時間', 'Created At', 'Thời gian tạo')}：{punch.created_at}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {hrOvertimes.length > 0 && (
          <>
            <h3>{t(lang, '加班報表', 'Overtime Report', 'Báo cáo tăng ca')}</h3>
            <div className="approval-list">
              {hrOvertimes.map((overtime) => (
                <div className="approval-item" key={`hr-overtime-${overtime.id}`}>
                  <div>
                    <strong>
                      #{overtime.id}｜{overtime.employee_no} {overtime.employee_name}｜{statusText(overtime.status, lang)}
                    </strong>
                    <p>{overtime.overtime_type}｜{overtime.overtime_date}</p>
                    <p>{t(lang, '時間', 'Time', 'Thời gian')}：{overtime.start_time} ~ {overtime.end_time}</p>
                    <p>{t(lang, '時數', 'Hours', 'Số giờ')}：{overtime.total_hours ?? '-'} {t(lang, '小時', 'hr(s)', 'giờ')}</p>
                    <p>{t(lang, '原因', 'Reason', 'Lý do')}：{overtime.reason || t(lang, '未填寫', 'N/A', 'Chưa điền')}</p>
                    <p>{t(lang, '審核主管', 'Approver', 'Người duyệt')}：{overtime.current_approver_name} / {overtime.current_approver_no}</p>
                    <p>{t(lang, '建立時間', 'Created At', 'Thời gian tạo')}：{overtime.created_at}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </>
    )}
  </section>
)}
        </>
      )}
    </div>
  )
}

export default App
