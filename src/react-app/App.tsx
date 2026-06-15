import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import './App.css'

const API_BASE = 'https://everbiz-leave-api.imd13.workers.dev'

// ==================== 型別定義 ====================
type Employee = {
  employee_no: string
  employee_name: string
  department_name: string
  position_title: string
  rank_type: string
  direct_manager_no: string
  direct_manager_name: string
  is_active: number
}

type FullEmployee = {
  employee_no: string
  employee_name: string
  department_name: string
  position_title: string
  rank_type: string
  direct_manager_no: string | null
  direct_manager_name: string | null
  first_proxy_no: string | null
  first_proxy_name: string | null
  second_proxy_no: string | null
  second_proxy_name: string | null
  pin_code: string
  card_no: string | null        // RFID 卡號
  is_active: number
  created_at: string
  updated_at: string
}

type CurrentUser = {
  employee_no: string
  employee_name: string
  department_name?: string
  position_title?: string
  rank_type?: string
  direct_manager_no?: string
  direct_manager_name?: string
  system_role?: string
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
  approval_stage?: string
  current_approver_no: string
  current_approver_name: string
  voided_by_no?: string
  voided_by_name?: string
  void_reason?: string
  cancelled_by_no?: string
  cancelled_by_name?: string
  cancel_reason?: string
  cancelled_at?: string
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
  department_name: string
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
  overtime_shift?: string
  cost_department?: string
  customer?: string
  work_order_no?: string
  quantity?: string
  due_date?: string
  description?: string
  pay_type?: string
}

type AttendanceRecord = {
  id: number
  employee_no: string
  employee_name: string
  work_date: string
  first_punch_time: string
  last_punch_time: string
  leave_hours: number
  overtime_hours: number
  punch_fix_status: string | null
  status_note: string | null
  updated_at: string
}

type OvertimeImportRow = {
  employee_no: string
  employee_name: string
  department_name: string
  overtime_date: string
  start_time: string
  end_time: string
  reason: string
  overtime_shift: string
  cost_department: string
  customer: string
  work_order_no: string
  quantity: string
  due_date: string
  description: string
  pay_type: string
}

type LeaveTypeOption = {
  code: string
  name_zh: string
  name_en: string
  name_vi: string
  sort_order: number
}

type FormType = 'leave' | 'punch' | 'overtime'
type SectionType = 'form' | 'approvals' | 'hr' | 'employees'
type RecordTab = 'leave' | 'punch' | 'overtime' | 'attendance'
type Lang = 'zh' | 'en' | 'vi'

// ==================== 多語系輔助 ====================
function t(lang: Lang, zh: string, en: string, vi: string): string {
  if (lang === 'en') return en
  if (lang === 'vi') return vi
  return zh
}

// ==================== 時間選項與計算 ====================
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

const holidays = [
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-27', '2026-04-03', '2026-04-06', '2026-06-19',
  '2026-09-25', '2026-10-09',
  '2027-01-01', '2027-02-04', '2027-02-05', '2027-02-06', '2027-02-08',
  '2027-02-09', '2027-03-01', '2027-04-05', '2027-04-06', '2027-06-09',
  '2027-09-15', '2027-10-11',
]

function isHoliday(date: Date): boolean {
  return holidays.includes(formatDate(date))
}

function calculateLeaveHours(
  startDate: string, startTime: string, endDate: string, endTime: string,
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
    if (!isWeekend(current) && !isHoliday(current)) {
      const currentDate = formatDate(current)
      let dayStart = workStart
      let dayEnd = workEnd
      if (currentDate === startDate) dayStart = Math.max(dayStart, timeToMinutes(startTime))
      if (currentDate === endDate) dayEnd = Math.min(dayEnd, timeToMinutes(endTime))
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

// ==================== Excel 輔助函數 ====================
function normalizeExcelTime(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'number') {
    const text = String(Math.round(value)).padStart(4, '0')
    return `${text.slice(0, 2)}:${text.slice(2, 4)}`
  }
  const raw = String(value).trim()
  if (raw.includes(':')) {
    const [h, m] = raw.split(':')
    return `${h.padStart(2, '0')}:${String(m || '00').padStart(2, '0')}`
  }
  const text = raw.padStart(4, '0')
  return `${text.slice(0, 2)}:${text.slice(2, 4)}`
}

function normalizeExcelDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  const rawText = String(value).trim()
  if (/^\d{8}$/.test(rawText)) {
    return `${rawText.slice(0, 4)}-${rawText.slice(4, 6)}-${rawText.slice(6, 8)}`
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
    }
  }
  const normalized = rawText.replace(/\//g, '-')
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '').replace(/\s/g, '').replace(/\n/g, '').replace(/\r/g, '').trim()
}

function findColumnIndex(headers: unknown[], keywords: string[]): number {
  return headers.findIndex(header => {
    const text = normalizeHeader(header)
    return keywords.every(keyword => text.includes(keyword))
  })
}

function getExcelCell(row: unknown[], index: number): unknown {
  if (index < 0) return ''
  return row[index] ?? ''
}

// ==================== 狀態與 CSV 輔助 ====================
function statusText(status: string, lang: Lang) {
  if (status === 'pending') return t(lang, '待審核', 'Pending', 'Chờ duyệt')
  if (status === 'approved') return t(lang, '已核准', 'Approved', 'Đã duyệt')
  if (status === 'rejected') return t(lang, '已駁回', 'Rejected', 'Đã từ chối')
  if (status === 'voided') return t(lang, '已作廢', 'Voided', 'Đã hủy')
  if (status === 'cancelled') return t(lang, '已取消', 'Cancelled', 'Đã hủy bỏ')
  return status
}

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(rows: unknown[][], headers: string[], filename: string) {
  const csvContent = [
    headers.map(csvCell).join(','),
    ...rows.map(row => row.map(csvCell).join(',')),
  ].join('\r\n')
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function statusOrder(status: string): number {
  if (status === 'approved') return 1
  if (status === 'pending') return 2
  if (status === 'cancelled') return 3
  if (status === 'voided') return 4
  if (status === 'rejected') return 5
  return 99
}

function sortByStatus<T extends { status: string; updated_at?: string; created_at?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const orderDiff = statusOrder(a.status) - statusOrder(b.status)
    if (orderDiff !== 0) return orderDiff
    const timeA = new Date(a.updated_at || a.created_at || '').getTime()
    const timeB = new Date(b.updated_at || b.created_at || '').getTime()
    return timeB - timeA
  })
}

// ==================== 主元件 ====================
function App() {
  const [loginEmployeeNo, setLoginEmployeeNo] = useState('')
  const [pinCode, setPinCode] = useState('')
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  const [activeForm, setActiveForm] = useState<FormType>('leave')
  const [activeSection, setActiveSection] = useState<SectionType>('form')
  const [lang, setLang] = useState<Lang>('zh')

  const [employeeList, setEmployeeList] = useState<Employee[]>([])
  const [leaveTypeOptions, setLeaveTypeOptions] = useState<LeaveTypeOption[]>([])

  const [hrEmployees, setHrEmployees] = useState<FullEmployee[]>([])
  const [hrEmployeeMessage, setHrEmployeeMessage] = useState('')
  const [isLoadingHrEmployees, setIsLoadingHrEmployees] = useState(false)
  const [showEmployeeForm, setShowEmployeeForm] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<FullEmployee | null>(null)
  const [employeeFormData, setEmployeeFormData] = useState({
    employee_no: '', employee_name: '', department_name: '', position_title: '',
    rank_type: '', direct_manager_no: '', direct_manager_name: '',
    first_proxy_no: '', first_proxy_name: '', second_proxy_no: '', second_proxy_name: '',
    pin_code: '', card_no: '', is_active: 1
  })

  const [employeeNo, setEmployeeNo] = useState('')
  const [employeeName, setEmployeeName] = useState('')
  const [leaveType, setLeaveType] = useState('')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('08:00')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('17:00')
  const [totalHours, setTotalHours] = useState(8)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<LeaveResult | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [punchDate, setPunchDate] = useState('')
  const [punchType, setPunchType] = useState('上班補卡')
  const [punchTime, setPunchTime] = useState('08:00')
  const [punchReason, setPunchReason] = useState('')
  const [punchMessage, setPunchMessage] = useState('')

  const [overtimeDate, setOvertimeDate] = useState('')
  const [overtimeStart, setOvertimeStart] = useState('17:30')
  const [overtimeEnd, setOvertimeEnd] = useState('19:30')
  const [overtimeReason, setOvertimeReason] = useState('')
  const [overtimeMessage, setOvertimeMessage] = useState('')

  const [overtimeImportRows, setOvertimeImportRows] = useState<OvertimeImportRow[]>([])
  const [overtimeImportMessage, setOvertimeImportMessage] = useState('')
  const [isImportingOvertime, setIsImportingOvertime] = useState(false)

  const [approverNo, setApproverNo] = useState('')
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRecord[]>([])
  const [pendingPunches, setPendingPunches] = useState<PunchRecord[]>([])
  const [pendingOvertimes, setPendingOvertimes] = useState<OvertimeRecord[]>([])
  const [approvalMessage, setApprovalMessage] = useState('')
  const [isLoadingApprovals, setIsLoadingApprovals] = useState(false)

  const [activeRecordTab, setActiveRecordTab] = useState<RecordTab>('leave')

  const [myLeaves, setMyLeaves] = useState<LeaveRecord[]>([])
  const [myLeaveMessage, setMyLeaveMessage] = useState('')
  const [isLoadingMyLeaves, setIsLoadingMyLeaves] = useState(false)

  const [myPunches, setMyPunches] = useState<PunchRecord[]>([])
  const [myPunchMessage, setMyPunchMessage] = useState('')
  const [isLoadingMyPunches, setIsLoadingMyPunches] = useState(false)

  const [myOvertimes, setMyOvertimes] = useState<OvertimeRecord[]>([])
  const [myOvertimeMessage, setMyOvertimeMessage] = useState('')
  const [isLoadingMyOvertimes, setIsLoadingMyOvertimes] = useState(false)

  // 出勤紀錄狀態
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [attendanceMessage, setAttendanceMessage] = useState('')
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false)

  const [hrLeaves, setHrLeaves] = useState<LeaveRecord[]>([])
  const [hrPunches, setHrPunches] = useState<PunchRecord[]>([])
  const [hrOvertimes, setHrOvertimes] = useState<OvertimeRecord[]>([])
  const [hrMessage, setHrMessage] = useState('')
  const [isLoadingHrLeaves, setIsLoadingHrLeaves] = useState(false)

  const canApprove = !!currentUser
  const canViewHrReport =
    currentUser?.system_role === 'hr' ||
    currentUser?.system_role === 'general_manager' ||
    currentUser?.system_role === 'finance'
  const canManageEmployees =
    currentUser?.system_role === 'hr' ||
    currentUser?.system_role === 'general_manager'

  const hasPendingApproval =
    pendingLeaves.length > 0 ||
    pendingPunches.length > 0 ||
    pendingOvertimes.length > 0

  // 統一的滾動切換函數
  const gotoSection = (section: SectionType, id: string) => {
    setActiveSection(section)
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  // ----- 載入假別 -----
  async function loadLeaveTypes() {
    try {
      const res = await fetch(`${API_BASE}/api/leave/types`)
      const data = await res.json()
      if (data.ok && data.leave_types) {
        setLeaveTypeOptions(data.leave_types)
        if (data.leave_types.length > 0) {
          const firstCode = data.leave_types[0].code
          if (!leaveType || !data.leave_types.some((opt: LeaveTypeOption) => opt.code === leaveType)) {
            setLeaveType(firstCode)
          }
        }
      }
    } catch (err) {
      console.warn('載入假別失敗', err)
    }
  }

  function getLeaveTypeDisplayName(value: string): string {
    const found = leaveTypeOptions.find(
      opt => opt.code === value || opt.name_zh === value
    )
    if (!found) return value
    if (lang === 'zh') return found.name_zh
    if (lang === 'en') return found.name_en
    return found.name_vi
  }

  // ----- HR 員工管理函數 -----
  function resetEmployeeForm() {
    setEmployeeFormData({
      employee_no: '', employee_name: '', department_name: '', position_title: '',
      rank_type: '', direct_manager_no: '', direct_manager_name: '',
      first_proxy_no: '', first_proxy_name: '', second_proxy_no: '', second_proxy_name: '',
      pin_code: '', card_no: '', is_active: 1
    })
    setEditingEmployee(null)
    setShowEmployeeForm(false)
  }

  function editEmployee(emp: FullEmployee) {
    setEditingEmployee(emp)
    setEmployeeFormData({
      employee_no: emp.employee_no,
      employee_name: emp.employee_name,
      department_name: emp.department_name || '',
      position_title: emp.position_title || '',
      rank_type: emp.rank_type || '',
      direct_manager_no: emp.direct_manager_no || '',
      direct_manager_name: emp.direct_manager_name || '',
      first_proxy_no: emp.first_proxy_no || '',
      first_proxy_name: emp.first_proxy_name || '',
      second_proxy_no: emp.second_proxy_no || '',
      second_proxy_name: emp.second_proxy_name || '',
      pin_code: emp.pin_code || '',
      card_no: emp.card_no || '',
      is_active: emp.is_active
    })
    setShowEmployeeForm(true)

    setTimeout(() => {
      document.getElementById('employee-section')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 100)
  }

  function newEmployee() {
    resetEmployeeForm()
    setEditingEmployee(null)
    setShowEmployeeForm(true)
  }

  async function handleSaveEmployee(event: React.FormEvent) {
    event.preventDefault()
    if (!currentUser) return
    const payload = {
      hr_no: currentUser.employee_no,
      ...employeeFormData,
      direct_manager_no: employeeFormData.direct_manager_no || null,
      first_proxy_no: employeeFormData.first_proxy_no || null,
      second_proxy_no: employeeFormData.second_proxy_no || null,
    }
    try {
      const res = await fetch(`${API_BASE}/api/hr/employee/upsert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!data.ok) {
        setHrEmployeeMessage(data.message || t(lang, '儲存失敗', 'Save failed', 'Lưu thất bại'))
        return
      }
      setHrEmployeeMessage(t(lang, '員工資料已儲存', 'Employee saved', 'Đã lưu nhân viên'))
      resetEmployeeForm()
      await loadHrEmployees()
    } catch {
      setHrEmployeeMessage(t(lang, '儲存失敗，請確認 API 是否正常', 'Save failed. Please check API.', 'Lưu thất bại. Vui lòng kiểm tra API.'))
    }
  }

  async function handleDeactivateEmployee(employeeNo: string) {
    if (!currentUser) return
    if (!window.confirm(t(lang, `確定要停用員工 ${employeeNo} 嗎？`, `Confirm deactivate employee ${employeeNo}?`, `Xác nhận vô hiệu hóa nhân viên ${employeeNo}?`))) return
    try {
      const res = await fetch(`${API_BASE}/api/hr/employee/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hr_no: currentUser.employee_no, employee_no: employeeNo })
      })
      const data = await res.json()
      if (!data.ok) {
        setHrEmployeeMessage(data.message || t(lang, '停用失敗', 'Deactivate failed', 'Vô hiệu hóa thất bại'))
        return
      }
      setHrEmployeeMessage(t(lang, '員工已停用', 'Employee deactivated', 'Nhân viên đã bị vô hiệu hóa'))
      await loadHrEmployees()
    } catch {
      setHrEmployeeMessage(t(lang, '停用失敗，請確認 API 是否正常', 'Deactivate failed. Please check API.', 'Vô hiệu hóa thất bại. Vui lòng kiểm tra API.'))
    }
  }

  async function loadHrEmployees() {
    if (!currentUser) return
    setIsLoadingHrEmployees(true)
    setHrEmployeeMessage(t(lang, '查詢中...', 'Loading...', 'Đang tải...'))
    try {
      const res = await fetch(`${API_BASE}/api/hr/employees?hr_no=${encodeURIComponent(currentUser.employee_no)}`)
      const data = await res.json()
      if (!data.ok) {
        setHrEmployeeMessage(data.message || t(lang, '查詢員工失敗', 'Failed to load employees', 'Tải nhân viên thất bại'))
        setHrEmployees([])
        return
      }
      setHrEmployees(data.employees || [])
      setHrEmployeeMessage(t(lang, `已載入 ${data.employees?.length || 0} 筆員工`, `Loaded ${data.employees?.length || 0} employee(s)`, `Đã tải ${data.employees?.length || 0} nhân viên`))
    } catch {
      setHrEmployeeMessage(t(lang, '查詢失敗，請確認 API 是否正常', 'Query failed. Please check API.', 'Truy vấn thất bại. Vui lòng kiểm tra API.'))
      setHrEmployees([])
    } finally {
      setIsLoadingHrEmployees(false)
    }
  }

  async function loadEmployees() {
    try {
      const res = await fetch(`${API_BASE}/api/employees`)
      const data = await res.json()
      if (data.ok) setEmployeeList(data.employees || [])
    } catch (err) {
      console.warn('載入員工列表失敗', err)
    }
  }

  // ----- 登入 -----
  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedEmployeeNo = loginEmployeeNo.trim().toUpperCase()
    const normalizedPinCode = pinCode.trim()
    if (!normalizedEmployeeNo || !normalizedPinCode) {
      setLoginError(t(lang, '請輸入員工編號與 PIN Code', 'Please enter employee number and PIN Code', 'Vui lòng nhập mã nhân viên và mã PIN'))
      return
    }
    setIsLoggingIn(true)
    setLoginError('')
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
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
      setEmployeeName(data.user.employee_name || '')
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
      setHrPunches([])
      setHrOvertimes([])
      setResult(null)
      setPunchMessage('')
      setOvertimeMessage('')
      setMyPunches([])
      setMyOvertimes([])
      setMyPunchMessage('')
      setMyOvertimeMessage('')
      setHrEmployeeMessage('')
      setHrEmployees([])
      setActiveSection('form')
    } catch {
      setLoginError(t(lang, '登入失敗，請確認 API 是否正常', 'Login failed. Please check the API.', 'Đăng nhập thất bại. Vui lòng kiểm tra API.'))
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
    setMyPunches([])
    setMyOvertimes([])
    setAttendanceRecords([])
    setHrLeaves([])
    setHrPunches([])
    setHrOvertimes([])
    setHrEmployees([])
    setApprovalMessage('')
    setMyLeaveMessage('')
    setMyPunchMessage('')
    setMyOvertimeMessage('')
    setAttendanceMessage('')
    setHrMessage('')
    setHrEmployeeMessage('')
    setResult(null)
    setError('')
    setPunchMessage('')
    setOvertimeMessage('')
    setActiveSection('form')
    setEmployeeList([])
    resetEmployeeForm()
  }

  // ----- 請假送出 -----
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    const normalizedEmployeeNo = employeeNo.trim().toUpperCase()
    if (!normalizedEmployeeNo) {
      setError(t(lang, '缺少員工編號，請重新登入', 'Missing employee number. Please login again.', 'Thiếu mã nhân viên, vui lòng đăng nhập lại'))
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
    if (totalHours > 24) {
      const confirmMsg = t(lang,
        '您申請的請假時數超過三天，主管核准後將再送董事長審核，確定送出嗎？',
        'Your leave request exceeds three days. After manager approval, it will be sent to the Chairman. Proceed?',
        'Đơn nghỉ của bạn vượt quá ba ngày. Sau khi quản lý duyệt, sẽ gửi tiếp đến Chủ tịch. Tiếp tục?'
      )
      if (!window.confirm(confirmMsg)) return
    }
    setIsSubmitting(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE}/api/leave/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_no: normalizedEmployeeNo,
          leave_type: leaveType,
          start_date: startDate, start_time: startTime,
          end_date: endDate, end_time: endTime,
          total_hours: totalHours, reason,
        }),
      })
      const data = await response.json()
      if (!data.ok) {
        setError(data.message || t(lang, '請假單送出失敗', 'Failed to submit leave request', 'Gửi đơn nghỉ phép thất bại'))
        setResult(null)
        return
      }
      setResult({
        employeeNo: normalizedEmployeeNo, employeeName: employeeName,
        department: currentUser?.department_name || '', position: currentUser?.position_title || '',
        approvalLevel: 0, leaveType, startDate, startTime, endDate, endTime, totalHours, reason,
        currentApproverNo: data.current_approver_no,
        currentApproverName: data.current_approver_name,
        leaveRequestId: data.leave_request_id,
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

  // ----- 補卡送出 -----
  async function handlePunchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!punchDate || !punchTime || !punchReason.trim()) {
      setPunchMessage(t(lang, '請填寫補卡日期、補卡時間與補卡原因', 'Please fill in the punch date, time, and reason', 'Vui lòng điền ngày, giờ và lý do bổ sung chấm công'))
      return
    }
    try {
      const response = await fetch(`${API_BASE}/api/punch/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_no: employeeNo, punch_type: punchType,
          punch_date: punchDate, punch_time: punchTime, reason: punchReason,
        }),
      })
      const data = await response.json()
      if (!data.ok) {
        setPunchMessage(data.message || t(lang, '補卡申請送出失敗', 'Failed to submit punch correction', 'Gửi đơn bổ sung chấm công thất bại'))
        return
      }
      setPunchMessage(t(lang,
        `補卡申請已送出，等待 ${approverLabel(data.current_approver_no, data.current_approver_name)} 審核。`,
        `Punch correction submitted. Awaiting approval from ${approverLabel(data.current_approver_no, data.current_approver_name)}.`,
        `Đơn bổ sung chấm công đã gửi. Chờ duyệt từ ${approverLabel(data.current_approver_no, data.current_approver_name)}.`
      ))
      setPunchReason('')
      await loadMyPunchesSilent()
    } catch {
      setPunchMessage(t(lang, '補卡申請送出失敗，請確認 /api/punch/create 是否正常', 'Submission failed. Please check /api/punch/create.', 'Gửi thất bại. Vui lòng kiểm tra /api/punch/create.'))
    }
  }

  // ----- 加班送出 -----
  async function handleOvertimeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const overtimeHours = calculateSimpleHours(overtimeStart, overtimeEnd)
    if (!overtimeDate || overtimeHours <= 0 || !overtimeReason.trim()) {
      setOvertimeMessage(t(lang, '請填寫加班日期、正確時間與加班原因', 'Please fill in the overtime date, valid times, and reason', 'Vui lòng điền ngày, giờ hợp lệ và lý do tăng ca'))
      return
    }
    try {
      const response = await fetch(`${API_BASE}/api/overtime/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_no: employeeNo,
          overtime_date: overtimeDate,
          start_time: overtimeStart,
          end_time: overtimeEnd,
          total_hours: overtimeHours,
          reason: overtimeReason,
        }),
      })
      const data = await response.json()
      if (!data.ok) {
        setOvertimeMessage(data.message || t(lang, '加班申請送出失敗', 'Failed to submit overtime request', 'Gửi đơn tăng ca thất bại'))
        return
      }
      setOvertimeMessage(t(lang,
        `加班申請已送出，等待 ${approverLabel(data.current_approver_no, data.current_approver_name)} 審核。`,
        `Overtime request submitted. Awaiting approval from ${approverLabel(data.current_approver_no, data.current_approver_name)}.`,
        `Đơn tăng ca đã gửi. Chờ duyệt từ ${approverLabel(data.current_approver_no, data.current_approver_name)}.`
      ))
      setOvertimeReason('')
      await loadMyOvertimesSilent()
    } catch {
      setOvertimeMessage(t(lang, '加班申請送出失敗，請確認 /api/overtime/create 是否正常', 'Submission failed. Please check /api/overtime/create.', 'Gửi thất bại. Vui lòng kiểm tra /api/overtime/create.'))
    }
  }

  // ===== Excel 批次匯入加班 =====
  function handleOvertimeExcelUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '' })
        const headerRowIndex = rawRows.findIndex(row =>
          row.some(cell => normalizeHeader(cell).includes('員工編號')) &&
          row.some(cell => normalizeHeader(cell).includes('起始日期'))
        )
        if (headerRowIndex < 0) {
          setOvertimeImportRows([])
          setOvertimeImportMessage('找不到 Excel 標題列，請確認表格包含「員工編號、起始日期、起始時間、結束時間」')
          return
        }
        const headers = rawRows[headerRowIndex]
        const idxEmployeeNo = findColumnIndex(headers, ['員工編號']) >= 0 ? findColumnIndex(headers, ['員工編號']) : findColumnIndex(headers, ['員工編'])
        const idxEmployeeName = findColumnIndex(headers, ['員工姓名']) >= 0 ? findColumnIndex(headers, ['員工姓名']) : findColumnIndex(headers, ['姓名'])
        const idxDepartmentName = findColumnIndex(headers, ['部門名稱']) >= 0 ? findColumnIndex(headers, ['部門名稱']) : findColumnIndex(headers, ['部門'])
        const idxOvertimeDate = findColumnIndex(headers, ['起始日期']) >= 0 ? findColumnIndex(headers, ['起始日期']) : findColumnIndex(headers, ['日期'])
        const idxStartTime = findColumnIndex(headers, ['起始時間']) >= 0 ? findColumnIndex(headers, ['起始時間']) : findColumnIndex(headers, ['起始時'])
        const idxEndTime = findColumnIndex(headers, ['結束時間']) >= 0 ? findColumnIndex(headers, ['結束時間']) : findColumnIndex(headers, ['結束時'])
        const idxReason = findColumnIndex(headers, ['加班原因']) >= 0 ? findColumnIndex(headers, ['加班原因']) : findColumnIndex(headers, ['原因'])
        const idxShift = findColumnIndex(headers, ['加班班別'])
        const idxCostDepartment = findColumnIndex(headers, ['費用歸屬部門'])
        const idxCustomer = findColumnIndex(headers, ['工單客戶'])
        const idxWorkOrderNo = findColumnIndex(headers, ['工單號碼'])
        const idxQuantity = findColumnIndex(headers, ['數量'])
        const idxDueDate = findColumnIndex(headers, ['交期'])
        const idxDescription = findColumnIndex(headers, ['加班內容說明']) >= 0 ? findColumnIndex(headers, ['加班內容說明']) : findColumnIndex(headers, ['內容說明'])
        const idxPayType = findColumnIndex(headers, ['給付方式']) >= 0 ? findColumnIndex(headers, ['給付方式']) : findColumnIndex(headers, ['給付'])
        const dataRows = rawRows.slice(headerRowIndex + 1)
        const parsedRows: OvertimeImportRow[] = dataRows
          .filter(row => String(getExcelCell(row, idxEmployeeNo) || '').trim() !== '')
          .map(row => ({
            employee_no: String(getExcelCell(row, idxEmployeeNo) || '').trim(),
            employee_name: String(getExcelCell(row, idxEmployeeName) || '').trim(),
            department_name: String(getExcelCell(row, idxDepartmentName) || '').trim(),
            overtime_date: normalizeExcelDate(getExcelCell(row, idxOvertimeDate)),
            start_time: normalizeExcelTime(getExcelCell(row, idxStartTime)),
            end_time: normalizeExcelTime(getExcelCell(row, idxEndTime)),
            reason: String(getExcelCell(row, idxReason) || '').trim(),
            overtime_shift: String(getExcelCell(row, idxShift) || '').trim(),
            cost_department: String(getExcelCell(row, idxCostDepartment) || '').trim(),
            customer: String(getExcelCell(row, idxCustomer) || '').trim(),
            work_order_no: String(getExcelCell(row, idxWorkOrderNo) || '').trim(),
            quantity: String(getExcelCell(row, idxQuantity) || '').trim(),
            due_date: normalizeExcelDate(getExcelCell(row, idxDueDate)),
            description: String(getExcelCell(row, idxDescription) || '').trim(),
            pay_type: String(getExcelCell(row, idxPayType) || '').trim(),
          }))
        setOvertimeImportRows(parsedRows)
        setOvertimeImportMessage(t(lang, `已讀取 ${parsedRows.length} 筆加班資料`, `Loaded ${parsedRows.length} overtime row(s)`, `Đã đọc ${parsedRows.length} dòng tăng ca`))
      } catch (err) {
        console.error(err)
        setOvertimeImportRows([])
        setOvertimeImportMessage(t(lang, 'Excel 讀取失敗，請確認格式', 'Failed to read Excel file. Please check the format.', 'Đọc Excel thất bại. Vui lòng kiểm tra định dạng.'))
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function validateOvertimeImportRows(rows: OvertimeImportRow[]) {
    const errors: string[] = []
    rows.forEach((row, index) => {
      const line = index + 2
      if (!row.employee_no) errors.push(`第 ${line} 列缺少員工編號`)
      if (!row.overtime_date) errors.push(`第 ${line} 列缺少起始日期`)
      if (!row.start_time) errors.push(`第 ${line} 列缺少起始時間`)
      if (!row.end_time) errors.push(`第 ${line} 列缺少結束時間`)
      if (!row.reason) errors.push(`第 ${line} 列缺少加班原因`)
      if (!row.pay_type) errors.push(`第 ${line} 列缺少給付方式`)
    })
    return errors
  }

  async function submitOvertimeImport() {
    if (!currentUser) return
    const errors = validateOvertimeImportRows(overtimeImportRows)
    if (errors.length > 0) {
      setOvertimeImportMessage(errors.join('\n'))
      return
    }
    setIsImportingOvertime(true)
    setOvertimeImportMessage(t(lang, '匯入中...', 'Importing...', 'Đang nhập...'))
    try {
      const res = await fetch(`${API_BASE}/api/overtime/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importer_no: currentUser.employee_no, rows: overtimeImportRows }),
      })
      const data = await res.json()
      if (!data.ok) {
        setOvertimeImportMessage(data.message || t(lang, '匯入失敗', 'Import failed', 'Nhập thất bại'))
        return
      }
      const errorText = data.errors && data.errors.length > 0 ? `\n${data.errors.join('\n')}` : ''
      setOvertimeImportMessage(`${data.message || t(lang, '匯入完成', 'Import complete', 'Nhập hoàn tất')}${errorText}`)
      setOvertimeImportRows([])
      await loadMyOvertimesSilent()
    } catch {
      setOvertimeImportMessage(t(lang, '匯入失敗，請確認 /api/overtime/import 是否正常', 'Import failed. Please check /api/overtime/import.', 'Nhập thất bại. Vui lòng kiểm tra /api/overtime/import.'))
    } finally {
      setIsImportingOvertime(false)
    }
  }

  // ----- 待審核 -----
  async function loadPendingApprovals() {
    const normalizedApproverNo = approverNo.trim().toUpperCase()
    if (!normalizedApproverNo) {
      setApprovalMessage(t(lang, '請輸入主管工號', 'Please enter manager employee number', 'Vui lòng nhập mã nhân viên quản lý'))
      return
    }
    setIsLoadingApprovals(true)
    setApprovalMessage(t(lang, '查詢中...', 'Loading...', 'Đang tải...'))
    try {
      const response = await fetch(`${API_BASE}/api/leave/pending?approver_no=${encodeURIComponent(normalizedApproverNo)}`)
      const data = await response.json()
      if (!data.ok) {
        setApprovalMessage(data.message || t(lang, '查詢待審核資料失敗', 'Failed to load pending approvals', 'Tải dữ liệu chờ duyệt thất bại'))
        setPendingLeaves([])
        setPendingPunches([])
        setPendingOvertimes([])
        return
      }
      setPendingLeaves(data.leaves || [])
      setPendingPunches(data.punches || [])
      setPendingOvertimes(data.overtimes || [])
      setApprovalMessage(t(lang,
        `已載入 ${data.leaves?.length || 0} 筆假單、${data.punches?.length || 0} 筆補卡、${data.overtimes?.length || 0} 筆加班待審核`,
        `Loaded ${data.leaves?.length || 0} leave(s), ${data.punches?.length || 0} punch(es), ${data.overtimes?.length || 0} overtime(s) pending approval`,
        `Đã tải ${data.leaves?.length || 0} đơn nghỉ, ${data.punches?.length || 0} đơn chấm công, ${data.overtimes?.length || 0} đơn tăng ca chờ duyệt`
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

  async function handleApprovalAction(leaveId: number, action: 'approved' | 'rejected') {
    const normalizedApproverNo = approverNo.trim().toUpperCase()
    if (!normalizedApproverNo) {
      setApprovalMessage(t(lang, '請輸入主管工號', 'Please enter manager employee number', 'Vui lòng nhập mã nhân viên quản lý'))
      return
    }
    const actionText = action === 'approved' ? t(lang, '核准', 'Approve', 'Duyệt') : t(lang, '駁回', 'Reject', 'Từ chối')
    if (!window.confirm(t(lang, `確定要${actionText}這張假單嗎？`, `Are you sure you want to ${actionText.toLowerCase()} this leave request?`, `Bạn có chắc muốn ${actionText.toLowerCase()} đơn nghỉ phép này không?`))) return
    setApprovalMessage(t(lang, `${actionText}處理中...`, 'Processing...', 'Đang xử lý...'))
    try {
      const response = await fetch(`${API_BASE}/api/leave/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leave_id: leaveId, approver_no: normalizedApproverNo, action }),
      })
      const data = await response.json()
      if (!data.ok) {
        setApprovalMessage(data.message || t(lang, '審核失敗', 'Approval failed', 'Phê duyệt thất bại'))
        return
      }
      setApprovalMessage(data.message || t(lang, `${actionText}完成`, `${actionText} complete`, `Hoàn tất ${actionText}`))
      await loadPendingApprovals()
      await loadMyLeavesSilent()
      if (canViewHrReport) await loadHrReportSilent()
    } catch {
      setApprovalMessage(t(lang, '審核失敗，請確認 API 是否正常', 'Approval failed. Please check the API.', 'Phê duyệt thất bại. Vui lòng kiểm tra API.'))
    }
  }

  async function handlePunchApprovalAction(punchId: number, action: 'approved' | 'rejected') {
    const normalizedApproverNo = approverNo.trim().toUpperCase()
    if (!normalizedApproverNo) {
      setApprovalMessage(t(lang, '請輸入主管工號', 'Please enter manager employee number', 'Vui lòng nhập mã nhân viên quản lý'))
      return
    }
    const actionText = action === 'approved' ? t(lang, '核准', 'Approve', 'Duyệt') : t(lang, '駁回', 'Reject', 'Từ chối')
    if (!window.confirm(t(lang, `確定要${actionText}這張補卡單嗎？`, `Are you sure you want to ${actionText.toLowerCase()} this punch correction?`, `Bạn có chắc muốn ${actionText.toLowerCase()} đơn chấm công này không?`))) return
    setApprovalMessage(t(lang, `補卡${actionText}處理中...`, 'Processing...', 'Đang xử lý...'))
    try {
      const response = await fetch(`${API_BASE}/api/punch/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          punch_request_id: punchId, approver_employee_no: normalizedApproverNo, action,
          comment: action === 'approved' ? t(lang, '同意補卡', 'Punch correction approved', 'Đồng ý bổ sung chấm công') : t(lang, '駁回補卡', 'Punch correction rejected', 'Từ chối bổ sung chấm công'),
        }),
      })
      const data = await response.json()
      if (!data.ok) {
        setApprovalMessage(data.message || t(lang, '補卡審核失敗', 'Punch approval failed', 'Phê duyệt chấm công thất bại'))
        return
      }
      setApprovalMessage(data.message || t(lang, `補卡${actionText}完成`, `Punch correction ${actionText.toLowerCase()} complete`, `Hoàn tất ${actionText} chấm công`))
      await loadPendingApprovals()
      await loadMyPunchesSilent()
    } catch {
      setApprovalMessage(t(lang, '補卡審核失敗，請確認 /api/punch/action 是否正常', 'Punch approval failed. Please check /api/punch/action.', 'Phê duyệt thất bại. Vui lòng kiểm tra /api/punch/action.'))
    }
  }

  async function handleOvertimeApprovalAction(overtimeId: number, action: 'approved' | 'rejected') {
    const normalizedApproverNo = approverNo.trim().toUpperCase()
    if (!normalizedApproverNo) {
      setApprovalMessage(t(lang, '請輸入主管工號', 'Please enter manager employee number', 'Vui lòng nhập mã nhân viên quản lý'))
      return
    }
    const actionText = action === 'approved' ? t(lang, '核准', 'Approve', 'Duyệt') : t(lang, '駁回', 'Reject', 'Từ chối')
    if (!window.confirm(t(lang, `確定要${actionText}這張加班單嗎？`, `Are you sure you want to ${actionText.toLowerCase()} this overtime request?`, `Bạn có chắc muốn ${actionText.toLowerCase()} đơn tăng ca này không?`))) return
    setApprovalMessage(t(lang, `加班${actionText}處理中...`, 'Processing...', 'Đang xử lý...'))
    try {
      const response = await fetch(`${API_BASE}/api/overtime/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overtime_request_id: overtimeId, approver_employee_no: normalizedApproverNo, action,
          comment: action === 'approved' ? t(lang, '同意加班', 'Overtime approved', 'Đồng ý tăng ca') : t(lang, '駁回加班', 'Overtime rejected', 'Từ chối tăng ca'),
        }),
      })
      const data = await response.json()
      if (!data.ok) {
        setApprovalMessage(data.message || t(lang, '加班審核失敗', 'Overtime approval failed', 'Phê duyệt tăng ca thất bại'))
        return
      }
      setApprovalMessage(data.message || t(lang, `加班${actionText}完成`, `Overtime ${actionText.toLowerCase()} complete`, `Hoàn tất ${actionText} tăng ca`))
      await loadPendingApprovals()
      await loadMyOvertimesSilent()
    } catch {
      setApprovalMessage(t(lang, '加班審核失敗，請確認 /api/overtime/action 是否正常', 'Overtime approval failed. Please check /api/overtime/action.', 'Phê duyệt thất bại. Vui lòng kiểm tra /api/overtime/action.'))
    }
  }

  // ----- 我的紀錄 (Silent) -----
  async function loadMyLeavesSilent() {
    if (!currentUser) return
    try {
      const res = await fetch(`${API_BASE}/api/leave/my?employee_no=${encodeURIComponent(currentUser.employee_no)}`)
      const data = await res.json()
      if (data.ok) setMyLeaves(sortByStatus(data.leaves || []))
    } catch { /* silent */ }
  }

  async function loadMyPunchesSilent() {
    if (!currentUser) return
    try {
      const res = await fetch(`${API_BASE}/api/punch/my?employee_no=${encodeURIComponent(currentUser.employee_no)}`)
      const data = await res.json()
      if (data.ok) setMyPunches(sortByStatus(data.punches || []))
    } catch { /* silent */ }
  }

  async function loadMyOvertimesSilent() {
    if (!currentUser) return
    try {
      const res = await fetch(`${API_BASE}/api/overtime/my?employee_no=${encodeURIComponent(currentUser.employee_no)}`)
      const data = await res.json()
      if (data.ok) setMyOvertimes(sortByStatus(data.overtimes || []))
    } catch { /* silent */ }
  }

  // ----- 我的紀錄 (Loading) -----
  async function loadMyLeaves() {
    if (!currentUser) return
    setIsLoadingMyLeaves(true)
    setMyLeaveMessage(t(lang, '查詢中...', 'Loading...', 'Đang tải...'))
    try {
      const res = await fetch(`${API_BASE}/api/leave/my?employee_no=${encodeURIComponent(currentUser.employee_no)}`)
      const data = await res.json()
      if (!data.ok) {
        setMyLeaveMessage(data.message || t(lang, '查詢我的假單失敗', 'Failed to load my leave requests', 'Tải đơn nghỉ phép thất bại'))
        setMyLeaves([])
        return
      }
      setMyLeaves(sortByStatus(data.leaves || []))
      setMyLeaveMessage(t(lang, `已載入 ${data.leaves?.length || 0} 筆我的假單`, `Loaded ${data.leaves?.length || 0} leave request(s)`, `Đã tải ${data.leaves?.length || 0} đơn nghỉ phép`))
    } catch {
      setMyLeaveMessage(t(lang, '查詢失敗，請確認 API 是否正常', 'Query failed. Please check the API.', 'Truy vấn thất bại. Vui lòng kiểm tra API.'))
      setMyLeaves([])
    } finally {
      setIsLoadingMyLeaves(false)
    }
  }

  async function loadMyPunches() {
    if (!currentUser) return
    setIsLoadingMyPunches(true)
    setMyPunchMessage(t(lang, '查詢中...', 'Loading...', 'Đang tải...'))
    try {
      const res = await fetch(`${API_BASE}/api/punch/my?employee_no=${encodeURIComponent(currentUser.employee_no)}`)
      const data = await res.json()
      if (!data.ok) {
        setMyPunchMessage(data.message || t(lang, '查詢我的補卡失敗', 'Failed to load my punch records', 'Tải đơn chấm công thất bại'))
        setMyPunches([])
        return
      }
      setMyPunches(sortByStatus(data.punches || []))
      setMyPunchMessage(t(lang, `已載入 ${data.punches?.length || 0} 筆我的補卡`, `Loaded ${data.punches?.length || 0} punch correction(s)`, `Đã tải ${data.punches?.length || 0} đơn chấm công`))
    } catch {
      setMyPunchMessage(t(lang, '查詢失敗，請確認 API 是否正常', 'Query failed. Please check the API.', 'Truy vấn thất bại. Vui lòng kiểm tra API.'))
      setMyPunches([])
    } finally {
      setIsLoadingMyPunches(false)
    }
  }

  async function loadMyOvertimes() {
    if (!currentUser) return
    setIsLoadingMyOvertimes(true)
    setMyOvertimeMessage(t(lang, '查詢中...', 'Loading...', 'Đang tải...'))
    try {
      const res = await fetch(`${API_BASE}/api/overtime/my?employee_no=${encodeURIComponent(currentUser.employee_no)}`)
      const data = await res.json()
      if (!data.ok) {
        setMyOvertimeMessage(data.message || t(lang, '查詢我的加班失敗', 'Failed to load my overtime records', 'Tải đơn tăng ca thất bại'))
        setMyOvertimes([])
        return
      }
      setMyOvertimes(sortByStatus(data.overtimes || []))
      setMyOvertimeMessage(t(lang, `已載入 ${data.overtimes?.length || 0} 筆我的加班`, `Loaded ${data.overtimes?.length || 0} overtime request(s)`, `Đã tải ${data.overtimes?.length || 0} đơn tăng ca`))
    } catch {
      setMyOvertimeMessage(t(lang, '查詢失敗，請確認 API 是否正常', 'Query failed. Please check the API.', 'Truy vấn thất bại. Vui lòng kiểm tra API.'))
      setMyOvertimes([])
    } finally {
      setIsLoadingMyOvertimes(false)
    }
  }

  // ----- 出勤紀錄 (Attendance) -----
  async function loadAttendance() {
    if (!currentUser) return
    setIsLoadingAttendance(true)
    setAttendanceMessage(t(lang, '查詢中...', 'Loading...', 'Đang tải...'))
    try {
      const res = await fetch(`${API_BASE}/api/attendance/daily?viewer_no=${encodeURIComponent(currentUser.employee_no)}`)
      const data = await res.json()
      if (!data.ok) {
        setAttendanceMessage(data.message || t(lang, '查詢出勤紀錄失敗', 'Failed to load attendance records', 'Tải chấm công thất bại'))
        setAttendanceRecords([])
        return
      }
      setAttendanceRecords(data.attendance || [])
      setAttendanceMessage(t(lang, `已載入 ${data.attendance?.length || 0} 筆出勤紀錄`, `Loaded ${data.attendance?.length || 0} attendance records`, `Đã tải ${data.attendance?.length || 0} bản ghi chấm công`))
    } catch {
      setAttendanceMessage(t(lang, '查詢失敗，請確認 API 是否正常', 'Query failed. Please check the API.', 'Truy vấn thất bại. Vui lòng kiểm tra API.'))
      setAttendanceRecords([])
    } finally {
      setIsLoadingAttendance(false)
    }
  }

  async function handleCancelLeave(leaveId: number) {
    if (!currentUser) return
    const cancelReason = window.prompt(t(lang, '請輸入取消原因', 'Please enter cancellation reason', 'Vui lòng nhập lý do hủy đơn'))
    if (!cancelReason || !cancelReason.trim()) {
      setMyLeaveMessage(t(lang, '已取消操作，未輸入原因', 'Cancelled: no reason entered', 'Đã hủy thao tác: chưa nhập lý do'))
      return
    }
    if (!window.confirm(t(lang,
      '確定要取消這張假單嗎？取消後無法恢復，且狀態將改為已取消。',
      'Are you sure you want to cancel this leave request? It cannot be undone and the status will become cancelled.',
      'Bạn có chắc muốn hủy đơn nghỉ phép này không? Sau khi hủy không thể khôi phục, trạng thái sẽ chuyển thành đã hủy.'
    ))) return
    setMyLeaveMessage(t(lang, '取消處理中...', 'Cancelling...', 'Đang xử lý hủy...'))
    try {
      const res = await fetch(`${API_BASE}/api/leave/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leave_id: leaveId, employee_no: currentUser.employee_no, cancel_reason: cancelReason.trim() }),
      })
      const data = await res.json()
      if (!data.ok) {
        setMyLeaveMessage(data.message || t(lang, '取消失敗', 'Cancellation failed', 'Hủy thất bại'))
        return
      }
      setMyLeaveMessage(data.message || t(lang, '假單已取消', 'Leave request cancelled', 'Đơn nghỉ phép đã bị hủy'))
      await loadMyLeaves()
      if (canViewHrReport) await loadHrReportSilent()
    } catch {
      setMyLeaveMessage(t(lang, '取消失敗，請確認 /api/leave/cancel 是否正常', 'Cancellation failed. Please check /api/leave/cancel.', 'Hủy thất bại. Vui lòng kiểm tra /api/leave/cancel.'))
    }
  }

  async function handleVoidLeave(leaveId: number) {
    if (!currentUser) return
    const voidReason = window.prompt(t(lang, '請輸入作廢原因', 'Please enter void reason', 'Vui lòng nhập lý do hủy'))
    if (!voidReason || !voidReason.trim()) {
      setHrMessage(t(lang, '已取消作廢，未輸入原因', 'Void cancelled: no reason entered', 'Đã hủy thao tác: chưa nhập lý do'))
      return
    }
    if (!window.confirm(t(lang,
      '確定要作廢這張假單嗎？此動作不會刪除資料，但會將狀態改為作廢。',
      'Are you sure you want to void this leave request? This will not delete the record, only mark it as voided.',
      'Bạn có chắc muốn hủy đơn nghỉ phép này không? Dữ liệu sẽ không bị xóa, chỉ đổi trạng thái.'
    ))) return
    setHrMessage(t(lang, '作廢處理中...', 'Voiding...', 'Đang xử lý hủy...'))
    try {
      const res = await fetch(`${API_BASE}/api/leave/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leave_id: leaveId, hr_no: currentUser.employee_no, void_reason: voidReason.trim() }),
      })
      const data = await res.json()
      if (!data.ok) {
        setHrMessage(data.message || t(lang, '作廢失敗', 'Void failed', 'Hủy thất bại'))
        return
      }
      setHrMessage(data.message || t(lang, '假單已作廢', 'Leave request voided', 'Đơn nghỉ phép đã bị hủy'))
      await loadHrReport()
    } catch {
      setHrMessage(t(lang, '作廢失敗，請確認 /api/leave/void 是否正常', 'Void failed. Please check /api/leave/void.', 'Hủy thất bại. Vui lòng kiểm tra /api/leave/void.'))
    }
  }

  // ----- HR 報表 -----
  async function loadHrReportSilent() {
    if (!canViewHrReport) return
    try {
      const res = await fetch(`${API_BASE}/api/hr/report`)
      const data = await res.json()
      if (data.ok) {
        setHrLeaves(sortByStatus(data.leaves || []))
        setHrPunches(sortByStatus(data.punches || []))
        setHrOvertimes(sortByStatus(data.overtimes || []))
      }
    } catch { /* silent */ }
  }

  async function loadHrReport() {
    setIsLoadingHrLeaves(true)
    setHrMessage(t(lang, '查詢中...', 'Loading...', 'Đang tải...'))
    try {
      const res = await fetch(`${API_BASE}/api/hr/report`)
      const data = await res.json()
      if (!data.ok) {
        setHrMessage(data.message || t(lang, '查詢 HR 報表失敗', 'Failed to load HR report', 'Tải báo cáo nhân sự thất bại'))
        setHrLeaves([])
        setHrPunches([])
        setHrOvertimes([])
        return
      }
      setHrLeaves(sortByStatus(data.leaves || []))
      setHrPunches(sortByStatus(data.punches || []))
      setHrOvertimes(sortByStatus(data.overtimes || []))
      setHrMessage(t(lang,
        `已載入 ${data.leaves?.length || 0} 筆請假、${data.punches?.length || 0} 筆補卡/忘刷、${data.overtimes?.length || 0} 筆加班`,
        `Loaded ${data.leaves?.length || 0} leave, ${data.punches?.length || 0} punch, ${data.overtimes?.length || 0} overtime records`,
        `Đã tải ${data.leaves?.length || 0} đơn nghỉ, ${data.punches?.length || 0} đơn chấm công, ${data.overtimes?.length || 0} đơn tăng ca`
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

  // ===== 匯出函數（自動補抓最新資料）=====
  async function exportHrLeavesCsv() {
    let leaveData = hrLeaves

    if (leaveData.length === 0) {
      const res = await fetch(`${API_BASE}/api/hr/report`)
      const data = await res.json()

      if (!data.ok) {
        setHrMessage(t(lang, '匯出失敗，無法取得請假資料', 'Export failed.', 'Xuất thất bại.'))
        return
      }

      leaveData = sortByStatus(data.leaves || [])
      setHrLeaves(leaveData)
    }

    if (leaveData.length === 0) {
      setHrMessage(t(lang, '目前沒有請假資料可以匯出', 'No leave data to export.', 'Không có dữ liệu.'))
      return
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

    const rows = leaveData.map(leave => [
      leave.id,
      leave.employee_no,
      leave.employee_name,
      getLeaveTypeDisplayName(leave.leave_type),
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

    downloadCsv(rows, headers, `HR_${t(lang, '請假報表', 'Leave_Report', 'Bao_cao_nghi_phep')}`)
    setHrMessage(t(lang, `已匯出 ${leaveData.length} 筆請假報表`, `Exported ${leaveData.length} leave record(s)`, `Đã xuất ${leaveData.length} bản ghi`))
  }

  async function exportHrPunchesCsv() {
    let punchData = hrPunches

    if (punchData.length === 0) {
      const res = await fetch(`${API_BASE}/api/hr/report`)
      const data = await res.json()

      if (!data.ok) {
        setHrMessage(t(lang, '匯出失敗，無法取得補卡資料', 'Export failed.', 'Xuất thất bại.'))
        return
      }

      punchData = sortByStatus(data.punches || [])
      setHrPunches(punchData)
    }

    if (punchData.length === 0) {
      setHrMessage(t(lang, '目前沒有補卡 / 忘刷資料可以匯出', 'No punch data to export.', 'Không có dữ liệu.'))
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

    const rows = punchData.map(punch => [
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

    downloadCsv(rows, headers, `HR_${t(lang, '補卡忘刷報表', 'Punch_Report', 'Bao_cao_cham_cong')}`)
    setHrMessage(t(lang, `已匯出 ${punchData.length} 筆補卡 / 忘刷報表`, `Exported ${punchData.length} punch record(s)`, `Đã xuất ${punchData.length} bản ghi`))
  }

  async function exportHrOvertimesCsv() {
    let overtimeData = hrOvertimes

    if (overtimeData.length === 0) {
      const res = await fetch(`${API_BASE}/api/hr/report`)
      const data = await res.json()

      if (!data.ok) {
        setHrMessage(t(lang, '匯出失敗，無法取得加班資料', 'Export failed.', 'Xuất thất bại.'))
        return
      }

      overtimeData = sortByStatus(data.overtimes || [])
      setHrOvertimes(overtimeData)
    }

    if (overtimeData.length === 0) {
      setHrMessage(t(lang, '目前沒有加班資料可以匯出', 'No overtime data to export.', 'Không có dữ liệu.'))
      return
    }

    const headers = [
      t(lang, '員工編號', 'Employee No.', 'Mã NV'),
      t(lang, '姓名', 'Name', 'Tên'),
      t(lang, '部門名稱', 'Department', 'Bộ phận'),
      t(lang, '加班日期', 'Overtime Date', 'Ngày tăng ca'),
      t(lang, '開始時間', 'Start Time', 'Giờ bắt đầu'),
      t(lang, '結束時間', 'End Time', 'Giờ kết thúc'),
      t(lang, '時數', 'Hours', 'Số giờ'),
      t(lang, '加班原因', 'Reason', 'Lý do'),
      t(lang, '加班班別', 'Overtime Shift', 'Ca tăng ca'),
      t(lang, '費用歸屬部門', 'Cost Department', 'Bộ phận chi phí'),
      t(lang, '工單客戶', 'Customer', 'Khách hàng'),
      t(lang, '工單號碼', 'Work Order No.', 'Số lệnh SX'),
      t(lang, '數量', 'Quantity', 'Số lượng'),
      t(lang, '交期', 'Due Date', 'Ngày giao hàng'),
      t(lang, '加班內容說明', 'Description', 'Mô tả nội dung'),
      t(lang, '給付方式', 'Pay Type', 'Hình thức thanh toán'),
      t(lang, '狀態', 'Status', 'Trạng thái'),
    ]

    const rows = overtimeData.map(ot => [
      ot.employee_no,
      ot.employee_name,
      ot.department_name || '',
      ot.overtime_date,
      ot.start_time,
      ot.end_time,
      ot.total_hours ?? '',
      ot.reason || '',
      ot.overtime_shift || '',
      ot.cost_department || '',
      ot.customer || '',
      ot.work_order_no || '',
      ot.quantity || '',
      ot.due_date || '',
      ot.description || '',
      ot.pay_type || '',
      statusText(ot.status, lang),
    ])

    downloadCsv(rows, headers, `HR_${t(lang, '加班報表', 'Overtime_Report', 'Bao_cao_tang_ca')}`)
    setHrMessage(t(lang, `已匯出 ${overtimeData.length} 筆加班報表`, `Exported ${overtimeData.length} overtime record(s)`, `Đã xuất ${overtimeData.length} bản ghi`))
  }

  // ----- useEffect -----
  useEffect(() => {
    if (!currentUser) return
    loadEmployees()
    loadLeaveTypes()
    loadMyLeavesSilent()
    loadMyPunchesSilent()
    loadMyOvertimesSilent()
    if (currentUser.system_role === 'hr' || currentUser.system_role === 'general_manager') {
      loadHrEmployees()
    }
  }, [currentUser])

  useEffect(() => {
    if (leaveTypeOptions.length > 0) {
      const exists = leaveTypeOptions.some(opt => opt.code === leaveType)
      if (!exists) {
        setLeaveType(leaveTypeOptions[0].code)
      }
    }
  }, [leaveTypeOptions, leaveType])

  useEffect(() => {
    if (currentUser?.employee_no) {
      setApproverNo(currentUser.employee_no)
      loadPendingApprovals()
    }
  }, [currentUser?.employee_no])

  function approverLabel(approverNo: string, approverName: string): string {
    return approverNo === 'PROXY'
      ? t(lang, '第一或第二代理人', '1st or 2nd Proxy', 'Người duyệt thay 1 hoặc 2')
      : `${approverName} / ${approverNo}`
  }

  function approverDisplay(approverNo: string, approverName: string): string {
    return approverLabel(approverNo, approverName)
  }

  // ==================== 渲染 ====================
  return (
    <div className="page">
      <nav className="top-nav">
        <div className="brand">
          <img src="https://pub-531c96b02ed745e0bbfd0e96bfde8518.r2.dev/EBC.png" alt="EBC" />
          <div><strong>Everbiz</strong><small>Leave Management</small></div>
        </div>
        {currentUser && (
          <div className="menu">
            <button type="button" onClick={() => gotoSection('form', 'leave-section')}>
              {t(lang, '請假申請', 'Leave Request', 'Đơn nghỉ phép')}
            </button>
            <button type="button" onClick={() => gotoSection('form', 'leave-section')}>
              {t(lang, '補卡申請', 'Punch Correction', 'Bổ sung chấm công')}
            </button>
            <button type="button" onClick={() => gotoSection('form', 'leave-section')}>
              {t(lang, '加班申請', 'Overtime Request', 'Đơn tăng ca')}
            </button>
            {canApprove && (
              <button
                type="button"
                onClick={() => gotoSection('approvals', 'approval-section')}
                className={`nav-btn ${activeSection === 'approvals' ? 'active' : ''} ${hasPendingApproval ? 'danger' : ''}`}
              >
                {t(lang, '待審核 / 代理審核', 'Pending / Proxy Approval', 'Chờ duyệt / Duyệt thay')}
              </button>
            )}
            {canViewHrReport && (
              <button type="button" onClick={() => gotoSection('hr', 'hr-section')}>
                {t(lang, 'HR報表', 'HR Report', 'Báo cáo nhân sự')}
              </button>
            )}
            {canManageEmployees && (
              <button type="button" onClick={() => gotoSection('employees', 'employee-section')}>
                {t(lang, '員工管理', 'Employee Mgmt', 'Quản lý nhân viên')}
              </button>
            )}
            <button type="button" onClick={handleLogout}>
              {t(lang, '登出', 'Logout', 'Đăng xuất')}
            </button>
          </div>
        )}
      </nav>

      {!currentUser ? (
        <section className="card login-card">
          <div className="language-row">
            <label>{t(lang, '語言', 'Language', 'Ngôn ngữ')}</label>
            <select value={lang} onChange={e => setLang(e.target.value as Lang)}>
              <option value="zh">中文</option>
              <option value="en">English</option>
              <option value="vi">Tiếng Việt</option>
            </select>
          </div>
          <h2>{t(lang, '身分確認', 'Identity Verification', 'Xác minh danh tính')}</h2>
          {loginError && <div className="alert">{loginError}</div>}
          <form onSubmit={handleLogin}>
            <input value={loginEmployeeNo} onChange={e => setLoginEmployeeNo(e.target.value)} placeholder={t(lang, '員工編號，例如 E010', 'Employee No., e.g. E010', 'Mã nhân viên, ví dụ E010')} />
            <input value={pinCode} onChange={e => setPinCode(e.target.value)} placeholder={t(lang, 'PIN Code，例如 E010', 'PIN Code, e.g. E010', 'Mã PIN, ví dụ E010')} type="password" />
            <button className="submit-btn" type="submit" disabled={isLoggingIn}>
              {isLoggingIn ? t(lang, '登入中...', 'Logging in...', 'Đang đăng nhập...') : t(lang, '進入系統', 'Enter System', 'Vào hệ thống')}
            </button>
          </form>
          <p className="small">
            {t(lang,
              '測試階段 PIN Code 與員工編號相同，例如 E001 / E001、E010 / E010、E900 / E900。',
              'During testing, PIN Code equals the employee number, e.g. E001 / E001, E010 / E010, E900 / E900.',
              'Trong giai đoạn thử nghiệm, mã PIN giống mã nhân viên, ví dụ E001 / E001, E010 / E010, E900 / E900.'
            )}
          </p>
        </section>
      ) : (
        <>
          <section className="card user-card">
            <h2>{t(lang, '目前登入', 'Current User', 'Người dùng hiện tại')}</h2>
            <div className="summary">
              <div><span>{t(lang, '員工', 'Employee', 'Nhân viên')}</span><strong>{currentUser.employee_no} {currentUser.employee_name}</strong></div>
              <div><span>{t(lang, '部門', 'Department', 'Bộ phận')}</span><strong>{currentUser.department_name || '-'}</strong></div>
              <div><span>{t(lang, '職稱', 'Position', 'Chức vụ')}</span><strong>{currentUser.position_title || '-'}</strong></div>
              <div><span>{t(lang, '角色', 'Role', 'Vai trò')}</span><strong>{currentUser.system_role || '-'}</strong></div>
            </div>
          </section>

          <header className="hero">
            <div className="hero-left">
              <div className="logo-wrap"><img src="https://pub-531c96b02ed745e0bbfd0e96bfde8518.r2.dev/EBC.png" alt="EBC" /></div>
              <p className="eyebrow">EVERBIZ INTERNAL HR SYSTEM</p>
              <h1>{t(lang, '人資申請系統 Demo', 'HR Request System Demo', 'Hệ thống yêu cầu nhân sự Demo')}</h1>
              <p>{t(lang,
                '請假、補卡、加班申請已串接 D1 Database，並進入主管簽核流程。',
                'Leave, punch correction, and overtime requests are connected to D1 Database and the manager approval workflow.',
                'Đơn nghỉ phép, bổ sung chấm công và tăng ca đã kết nối D1 Database và quy trình phê duyệt.'
              )}</p>
            </div>
            <div className="badge">PWA</div>
          </header>

          {/* 員工管理區塊 */}
          {activeSection === 'employees' && canManageEmployees && (
            <section id="employee-section" className="card result-card">
              <h2>{t(lang, '員工資料管理', 'Employee Management', 'Quản lý nhân viên')}</h2>
              <div className="approval-search">
                <button className="submit-btn" onClick={loadHrEmployees} disabled={isLoadingHrEmployees}>
                  {isLoadingHrEmployees ? t(lang, '查詢中...', 'Loading...', 'Đang tải...') : t(lang, '查詢員工', 'Load Employees', 'Tải nhân viên')}
                </button>
                <button className="submit-btn" onClick={newEmployee}>{t(lang, '新增員工', 'Add Employee', 'Thêm nhân viên')}</button>
              </div>
              {hrEmployeeMessage && <div className="note-box">{hrEmployeeMessage}</div>}

              {showEmployeeForm && (
                <div style={{ margin: '20px 0', padding: '16px', border: '1px solid #ddd', borderRadius: '12px' }}>
                  <h3>{editingEmployee ? t(lang, '編輯員工', 'Edit Employee', 'Sửa nhân viên') : t(lang, '新增員工', 'Add Employee', 'Thêm nhân viên')}</h3>
                  <form onSubmit={handleSaveEmployee}>
                    <div className="two">
                      <input type="text" placeholder={t(lang, '員工編號 *', 'Employee No. *', 'Mã NV *')} value={employeeFormData.employee_no} onChange={e => setEmployeeFormData({ ...employeeFormData, employee_no: e.target.value })} required />
                      <input type="text" placeholder={t(lang, '姓名 *', 'Name *', 'Tên *')} value={employeeFormData.employee_name} onChange={e => setEmployeeFormData({ ...employeeFormData, employee_name: e.target.value })} required />
                    </div>
                    <div className="two">
                      <input type="text" placeholder={t(lang, '部門', 'Department', 'Bộ phận')} value={employeeFormData.department_name} onChange={e => setEmployeeFormData({ ...employeeFormData, department_name: e.target.value })} />
                      <input type="text" placeholder={t(lang, '職稱', 'Position', 'Chức vụ')} value={employeeFormData.position_title} onChange={e => setEmployeeFormData({ ...employeeFormData, position_title: e.target.value })} />
                    </div>
                    <div className="two">
                      <input type="text" placeholder={t(lang, '職等 / 角色', 'Rank / Role', 'Cấp bậc / Vai trò')} value={employeeFormData.rank_type} onChange={e => setEmployeeFormData({ ...employeeFormData, rank_type: e.target.value })} />
                      <input type="text" placeholder={t(lang, '此員工的審核主管工號', "This employee's approver no.", 'Mã người duyệt của nhân viên này')} value={employeeFormData.direct_manager_no} onChange={e => setEmployeeFormData({ ...employeeFormData, direct_manager_no: e.target.value })} />
                    </div>
                    <div className="two">
                      <input type="text" placeholder={t(lang, '此員工的審核主管姓名', "This employee's approver name", 'Tên người duyệt của nhân viên này')} value={employeeFormData.direct_manager_name} onChange={e => setEmployeeFormData({ ...employeeFormData, direct_manager_name: e.target.value })} />
                    </div>
                    <div className="note-box">
                      {t(lang,
                        '填寫說明：上方「此員工的審核主管」代表此員工送出請假、補卡、加班時，由誰審核。下方「第一代理人 / 第二代理人」代表當此員工本身是主管時，誰可以代理此員工去核准別人的申請。',
                        `Input note: "This employee's approver" means who approves this employee's requests. "1st / 2nd proxy" means who can approve on behalf of this employee when acting as an approver.`,
                        `Ghi chú: "Người duyệt của nhân viên này" là người duyệt đơn của nhân viên này. "Người duyệt thay 1 / 2" là người có thể duyệt thay khi nhân viên này là người duyệt.`
                      )}
                    </div>
                    <div className="two">
                      <input type="text" placeholder={t(lang, '可代理此員工審核的第一代理人工號', '1st proxy approver no.', 'Mã người duyệt thay 1')} value={employeeFormData.first_proxy_no} onChange={e => setEmployeeFormData({ ...employeeFormData, first_proxy_no: e.target.value })} />
                      <input type="text" placeholder={t(lang, '可代理此員工審核的第一代理人姓名', '1st proxy approver name', 'Tên người duyệt thay 1')} value={employeeFormData.first_proxy_name} onChange={e => setEmployeeFormData({ ...employeeFormData, first_proxy_name: e.target.value })} />
                    </div>
                    <div className="two">
                      <input type="text" placeholder={t(lang, '可代理此員工審核的第二代理人工號', '2nd proxy approver no.', 'Mã người duyệt thay 2')} value={employeeFormData.second_proxy_no} onChange={e => setEmployeeFormData({ ...employeeFormData, second_proxy_no: e.target.value })} />
                      <input type="text" placeholder={t(lang, '可代理此員工審核的第二代理人姓名', '2nd proxy approver name', 'Tên người duyệt thay 2')} value={employeeFormData.second_proxy_name} onChange={e => setEmployeeFormData({ ...employeeFormData, second_proxy_name: e.target.value })} />
                    </div>
                    <div className="two">
                      <input type="text" placeholder={t(lang, '登入 PIN 碼', 'Login PIN Code', 'Mã PIN đăng nhập')} value={employeeFormData.pin_code} onChange={e => setEmployeeFormData({ ...employeeFormData, pin_code: e.target.value })} />
                    </div>
                    <div className="two">
                      <input
                        type="text"
                        placeholder={t(lang, 'RFID 卡號 (選填)', 'RFID Card No. (optional)', 'Mã thẻ RFID (tùy chọn)')}
                        value={employeeFormData.card_no}
                        onChange={e => setEmployeeFormData({ ...employeeFormData, card_no: e.target.value })}
                      />
                    </div>
                    <div className="employee-active-row">
                      <label>
                        <input type="checkbox" checked={employeeFormData.is_active === 1} onChange={e => setEmployeeFormData({ ...employeeFormData, is_active: e.target.checked ? 1 : 0 })} />
                        {t(lang, '啟用此員工帳號', 'Activate this employee account', 'Kích hoạt tài khoản nhân viên này')}
                      </label>
                    </div>
                    <div className="employee-form-actions">
                      <button type="submit" className="approve-btn">{t(lang, '儲存', 'Save', 'Lưu')}</button>
                      <button type="button" className="reject-btn" onClick={() => { resetEmployeeForm(); setShowEmployeeForm(false) }}>{t(lang, '取消', 'Cancel', 'Hủy')}</button>
                    </div>
                  </form>
                </div>
              )}

              {hrEmployees.length === 0 ? (
                <p className="small">{t(lang, '暫無員工資料', 'No employee data', 'Chưa có dữ liệu nhân viên')}</p>
              ) : (
                <div className="approval-list" style={{ overflowX: 'auto' }}>
                  <table className="employee-table">
                    <thead>
                      <tr>
                        <th>{t(lang, '編號', 'No.', 'Mã')}</th>
                        <th>{t(lang, '姓名', 'Name', 'Tên')}</th>
                        <th>{t(lang, '部門', 'Dept', 'Bộ phận')}</th>
                        <th>{t(lang, '職稱', 'Title', 'Chức vụ')}</th>
                        <th>{t(lang, '主管', 'Manager', 'Quản lý')}</th>
                        <th>{t(lang, '第一代理人', '1st Proxy', 'Đại diện 1')}</th>
                        <th>{t(lang, '第二代理人', '2nd Proxy', 'Đại diện 2')}</th>
                        <th>{t(lang, '卡號', 'Card No.', 'Mã thẻ')}</th>
                        <th>{t(lang, '狀態', 'Status', 'Trạng thái')}</th>
                        <th>{t(lang, '操作', 'Actions', 'Hành động')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hrEmployees.map(emp => (
                        <tr key={emp.employee_no}>
                          <td>{emp.employee_no}</td>
                          <td>{emp.employee_name}</td>
                          <td>{emp.department_name}</td>
                          <td>{emp.position_title}</td>
                          <td>{emp.direct_manager_name} ({emp.direct_manager_no})</td>
                          <td>{emp.first_proxy_name} ({emp.first_proxy_no})</td>
                          <td>{emp.second_proxy_name} ({emp.second_proxy_no})</td>
                          <td>{emp.card_no || ''}</td>
                          <td>{emp.is_active ? t(lang, '啟用', 'Active', 'Kích hoạt') : t(lang, '停用', 'Inactive', 'Vô hiệu')}</td>
                          <td>
                            <button className="approve-btn" onClick={() => editEmployee(emp)}>{t(lang, '編輯', 'Edit', 'Sửa')}</button>
                            {emp.is_active === 1 && (
                              <button className="reject-btn" style={{ marginLeft: '8px' }} onClick={() => handleDeactivateEmployee(emp.employee_no)}>{t(lang, '停用', 'Deactivate', 'Vô hiệu')}</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* 表單區塊（請假、補卡、加班） */}
          {activeSection === 'form' && (
            <div id="leave-section">
              <section className="card result-card">
                <h2>{t(lang, '申請類型', 'Request Type', 'Loại đơn')}</h2>
                <div className="form-tabs">
                  <button className={activeForm === 'leave' ? 'active' : ''} onClick={() => setActiveForm('leave')}>{t(lang, '請假申請', 'Leave Request', 'Đơn nghỉ phép')}</button>
                  <button className={activeForm === 'punch' ? 'active' : ''} onClick={() => setActiveForm('punch')}>{t(lang, '補卡申請', 'Punch Correction', 'Bổ sung chấm công')}</button>
                  <button className={activeForm === 'overtime' ? 'active' : ''} onClick={() => setActiveForm('overtime')}>{t(lang, '加班申請', 'Overtime Request', 'Đơn tăng ca')}</button>
                </div>
              </section>

              <div className="grid">
                <section className="card">
                  {activeForm === 'leave' && (
                    <>
                      <h2>{t(lang, '請假申請', 'Leave Request', 'Đơn nghỉ phép')}</h2>
                      {error && <div className="alert">{error}</div>}
                      <form onSubmit={handleSubmit}>
                        <input value={employeeNo} readOnly placeholder={t(lang, '員工編號', 'Employee No.', 'Mã nhân viên')} />
                        <input value={employeeName} readOnly placeholder={t(lang, '姓名', 'Name', 'Tên')} />
                        <select value={leaveType} onChange={e => setLeaveType(e.target.value)}>
                          {leaveTypeOptions.map(item => (
                            <option key={item.code} value={item.code}>
                              {getLeaveTypeDisplayName(item.code)}
                            </option>
                          ))}
                        </select>
                        <div className="two">
                          <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setTotalHours(calculateLeaveHours(e.target.value, startTime, endDate, endTime)) }} />
                          <select value={startTime} onChange={e => { setStartTime(e.target.value); setTotalHours(calculateLeaveHours(startDate, e.target.value, endDate, endTime)) }}>{timeOptions.map(t => <option key={t} value={t}>{t}</option>)}</select>
                        </div>
                        <div className="two">
                          <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setTotalHours(calculateLeaveHours(startDate, startTime, e.target.value, endTime)) }} />
                          <select value={endTime} onChange={e => { setEndTime(e.target.value); setTotalHours(calculateLeaveHours(startDate, startTime, endDate, e.target.value)) }}>{timeOptions.map(t => <option key={t} value={t}>{t}</option>)}</select>
                        </div>
                        <div className="note-box">{t(lang, `請假時數：${totalHours} 小時`, `Leave hours: ${totalHours} hr(s)`, `Số giờ nghỉ: ${totalHours} giờ`)}</div>
                        <textarea rows={5} value={reason} onChange={e => setReason(e.target.value)} placeholder={t(lang, '請假原因', 'Reason for leave', 'Lý do nghỉ phép')} />
                        <button className="submit-btn" type="submit" disabled={isSubmitting}>{isSubmitting ? t(lang, '送出中...', 'Submitting...', 'Đang gửi...') : t(lang, '送出假單', 'Submit Leave Request', 'Gửi đơn nghỉ phép')}</button>
                      </form>
                    </>
                  )}
                  {activeForm === 'punch' && (
                    <>
                      <h2>{t(lang, '補卡申請', 'Punch Correction', 'Bổ sung chấm công')}</h2>
                      {punchMessage && <div className="note-box">{punchMessage}</div>}
                      <form onSubmit={handlePunchSubmit}>
                        <input value={employeeNo} readOnly placeholder={t(lang, '員工編號', 'Employee No.', 'Mã nhân viên')} />
                        <input value={employeeName} readOnly placeholder={t(lang, '姓名', 'Name', 'Tên')} />
                        <select value={punchType} onChange={e => setPunchType(e.target.value)}>
                          <option>{t(lang, '上班補卡', 'Clock-in Correction', 'Bổ sung giờ vào')}</option>
                          <option>{t(lang, '下班補卡', 'Clock-out Correction', 'Bổ sung giờ ra')}</option>
                          <option>{t(lang, '上下班補卡', 'Both Clock-in/out Correction', 'Bổ sung cả vào và ra')}</option>
                          <option>{t(lang, '外出返廠補卡', 'Field Return Correction', 'Bổ sung sau công tác')}</option>
                        </select>
                        <div className="two">
                          <input type="date" value={punchDate} onChange={e => setPunchDate(e.target.value)} />
                          <select value={punchTime} onChange={e => setPunchTime(e.target.value)}>{timeOptions.map(t => <option key={t} value={t}>{t}</option>)}</select>
                        </div>
                        <textarea rows={5} value={punchReason} onChange={e => setPunchReason(e.target.value)} placeholder={t(lang, '補卡原因，例如忘記刷卡、卡機異常、外出公務', 'Reason, e.g. forgot to clock in, machine error, business trip', 'Lý do, ví dụ quên chấm công, máy lỗi, công tác')} />
                        <div className="note-box">{t(lang, '簽核流程：人資 → 直屬主管', 'Approval flow: HR → Direct Supervisor', 'Quy trình duyệt: Nhân sự → Quản lý trực tiếp')}</div>
                        <button className="submit-btn" type="submit">{t(lang, '送出補卡申請', 'Submit Punch Correction', 'Gửi đơn bổ sung chấm công')}</button>
                      </form>
                    </>
                  )}
                  {activeForm === 'overtime' && (
                    <>
                      <h2>{t(lang, '加班申請', 'Overtime Request', 'Đơn tăng ca')}</h2>
                      {overtimeMessage && <div className="note-box">{overtimeMessage}</div>}
                      <form onSubmit={handleOvertimeSubmit}>
                        <input value={employeeNo} readOnly placeholder={t(lang, '員工編號', 'Employee No.', 'Mã nhân viên')} />
                        <input value={employeeName} readOnly placeholder={t(lang, '姓名', 'Name', 'Tên')} />
                        <input type="date" value={overtimeDate} onChange={e => setOvertimeDate(e.target.value)} />
                        <div className="two">
                          <select value={overtimeStart} onChange={e => setOvertimeStart(e.target.value)}>{timeOptions.map(t => <option key={t} value={t}>{t}</option>)}</select>
                          <select value={overtimeEnd} onChange={e => setOvertimeEnd(e.target.value)}>{timeOptions.map(t => <option key={t} value={t}>{t}</option>)}</select>
                        </div>
                        <div className="note-box">{t(lang, `加班時數：${calculateSimpleHours(overtimeStart, overtimeEnd)} 小時`, `Overtime hours: ${calculateSimpleHours(overtimeStart, overtimeEnd)} hr(s)`, `Số giờ tăng ca: ${calculateSimpleHours(overtimeStart, overtimeEnd)} giờ`)}</div>
                        <textarea rows={5} value={overtimeReason} onChange={e => setOvertimeReason(e.target.value)} placeholder={t(lang, '加班原因 / 工作內容', 'Reason / Work content', 'Lý do / Nội dung công việc')} />
                        <div className="note-box">{t(lang, '簽核流程：人資 → 直屬主管', 'Approval flow: HR → Direct Supervisor', 'Quy trình duyệt: Nhân sự → Quản lý trực tiếp')}</div>
                        <button className="submit-btn" type="submit">{t(lang, '送出加班申請', 'Submit Overtime Request', 'Gửi đơn tăng ca')}</button>
                      </form>

                      <div style={{ marginTop: '24px', borderTop: '1px solid #ddd', paddingTop: '16px' }}>
                        <h3>{t(lang, '批次匯入加班 (Excel)', 'Batch Import Overtime (Excel)', 'Nhập hàng loạt tăng ca (Excel)')}</h3>
                        <input type="file" accept=".xlsx, .xls, .csv" onChange={handleOvertimeExcelUpload} />
                        <div className="note-box" style={{ marginTop: '8px' }}>
                          {t(lang,
                            `已載入 ${overtimeImportRows.length} 筆資料`,
                            `Loaded ${overtimeImportRows.length} row(s)`,
                            `Đã đọc ${overtimeImportRows.length} dòng`
                          )}
                          <button
                            className="submit-btn"
                            type="button"
                            onClick={submitOvertimeImport}
                            disabled={isImportingOvertime || overtimeImportRows.length === 0}
                            style={{ marginTop: '12px' }}
                          >
                            {isImportingOvertime
                              ? t(lang, '匯入中...', 'Importing...', 'Đang nhập...')
                              : t(lang, '確認匯入', 'Confirm Import', 'Xác nhận nhập')}
                          </button>
                        </div>
                        {overtimeImportMessage && <div className="note-box">{overtimeImportMessage}</div>}
                        <p className="small">
                          {t(lang,
                            'Excel 欄位名稱對應：員工編號、員工姓名、部門名稱、起始日期、起始時間、結束時間、加班原因、加班班別、費用歸屬部門、工單客戶、工單號碼、數量、交期、加班內容說明、給付方式。日期格式支援 YYYY-MM-DD 或 Excel 數字日期；時間格式支援 HHMM 或 HH:MM。',
                            'Excel column mapping: Employee No., Employee Name, Department Name, Overtime Date, Start Time, End Time, Reason, Overtime Shift, Cost Department, Customer, Work Order No., Quantity, Due Date, Description, Pay Type. Date supports YYYY-MM-DD or Excel numeric date; time supports HHMM or HH:MM.',
                            'Ánh xạ cột Excel: Mã NV, Tên NV, Tên bộ phận, Ngày tăng ca, Giờ bắt đầu, Giờ kết thúc, Lý do, Ca tăng ca, Bộ phận chi phí, Khách hàng, Số lệnh SX, Số lượng, Ngày giao hàng, Mô tả nội dung, Hình thức thanh toán. Ngày hỗ trợ YYYY-MM-DD hoặc số Excel; giờ hỗ trợ HHMM hoặc HH:MM.'
                          )}
                        </p>
                      </div>
                    </>
                  )}
                </section>

                <section className="card">
                  <h2>{t(lang, '員工資料', 'Employee Data', 'Thông tin nhân viên')}</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>{t(lang, '編號', 'No.', 'Mã')}</th>
                        <th>{t(lang, '姓名', 'Name', 'Tên')}</th>
                        <th>{t(lang, '職稱', 'Position', 'Chức vụ')}</th>
                        <th>{t(lang, '部門', 'Department', 'Bộ phận')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeeList.map(emp => (
                        <tr key={emp.employee_no}>
                          <td>{emp.employee_no}</td>
                          <td>{emp.employee_name}</td>
                          <td>{emp.position_title}</td>
                          <td>{emp.department_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>

              {result && (
                <section className="card result-card">
                  <h2>{t(lang, '假單送出結果', 'Leave Submission Result', 'Kết quả gửi đơn nghỉ phép')}</h2>
                  <div className="summary">
                    <div><span>{t(lang, '假單編號', 'Request ID', 'Mã đơn')}</span><strong>{result.leaveRequestId || '-'}</strong></div>
                    <div><span>{t(lang, '員工', 'Employee', 'Nhân viên')}</span><strong>{result.employeeNo} {result.employeeName}</strong></div>
                    <div><span>{t(lang, '假別', 'Leave Type', 'Loại nghỉ')}</span><strong>{getLeaveTypeDisplayName(result.leaveType)}</strong></div>
                    <div><span>{t(lang, '期間', 'Period', 'Thời gian')}</span><strong>{result.startDate} {result.startTime} ~ {result.endDate} {result.endTime}</strong></div>
                    <div><span>{t(lang, '時數', 'Hours', 'Số giờ')}</span><strong>{result.totalHours} {t(lang, '小時', 'hr(s)', 'giờ')}</strong></div>
                    <div><span>{t(lang, '目前審核主管', 'Current Approver', 'Người phê duyệt')}</span><strong>{approverDisplay(result.currentApproverNo, result.currentApproverName)}</strong></div>
                  </div>
                  <p className="small">
                    {result.totalHours > 24
                      ? t(lang, '三天以上請假已直接送交董事長審核，請耐心等候。', 'Leave request for more than 3 days has been sent directly to the Chairman for approval.', 'Đơn nghỉ trên 3 ngày đã được gửi trực tiếp đến Chủ tịch để phê duyệt.')
                      : t(lang, '假單已送出，將由主管審核。', 'Leave request submitted and will be reviewed by your supervisor.', 'Đơn nghỉ đã được gửi và sẽ được quản lý xem xét.')}
                  </p>
                </section>
              )}

              <section className="card result-card">
                <h2>{t(lang, '我的紀錄', 'My Records', 'Hồ sơ của tôi')}</h2>
                <div className="form-tabs">
                  <button className={activeRecordTab === 'leave' ? 'active' : ''} onClick={() => setActiveRecordTab('leave')}>{t(lang, '請假紀錄', 'Leave Records', 'Lịch sử nghỉ phép')}</button>
                  <button className={activeRecordTab === 'punch' ? 'active' : ''} onClick={() => setActiveRecordTab('punch')}>{t(lang, '補卡紀錄', 'Punch Records', 'Lịch sử chấm công')}</button>
                  <button className={activeRecordTab === 'overtime' ? 'active' : ''} onClick={() => setActiveRecordTab('overtime')}>{t(lang, '加班紀錄', 'Overtime Records', 'Lịch sử tăng ca')}</button>
                  <button className={activeRecordTab === 'attendance' ? 'active' : ''} onClick={() => { setActiveRecordTab('attendance'); loadAttendance(); }}>{t(lang, '出勤紀錄', 'Attendance', 'Chấm công')}</button>
                </div>

                {activeRecordTab === 'leave' && (
                  <>
                    <button className="submit-btn" onClick={loadMyLeaves} disabled={isLoadingMyLeaves}>{isLoadingMyLeaves ? t(lang, '查詢中...', 'Loading...', 'Đang tải...') : t(lang, '查詢我的假單', 'Load My Leave Requests', 'Tải đơn nghỉ phép của tôi')}</button>
                    {myLeaveMessage && <div className="note-box">{myLeaveMessage}</div>}
                    {myLeaves.length === 0 ? (
                      <p className="small">{t(lang, '目前沒有請假紀錄。', 'No leave records found.', 'Không có bản ghi nghỉ phép.')}</p>
                    ) : (
                      <div className="approval-list">
                        {myLeaves.map(leave => (
                          <div className="approval-item" key={leave.id}>
                            <div>
                              <strong>#{leave.id}｜{getLeaveTypeDisplayName(leave.leave_type)}｜{statusText(leave.status, lang)}</strong>
                              <p>{t(lang, '日期', 'Date', 'Ngày')}：{leave.start_date} {leave.start_time || ''} ~ {leave.end_date} {leave.end_time || ''}</p>
                              <p>{t(lang, '時數', 'Hours', 'Số giờ')}：{leave.total_hours ?? '-'} {t(lang, '小時', 'hr(s)', 'giờ')}</p>
                              <p>{t(lang, '原因', 'Reason', 'Lý do')}：{leave.reason || t(lang, '未填寫', 'N/A', 'Chưa điền')}</p>
                              <p>{t(lang, '審核主管', 'Approver', 'Người duyệt')}：{approverDisplay(leave.current_approver_no, leave.current_approver_name)}</p>
                              <p>{t(lang, '建立時間', 'Created At', 'Thời gian tạo')}：{leave.created_at}</p>
                            </div>
                            {leave.status === 'pending' && (
                              <div className="approval-actions">
                                <button className="reject-btn" onClick={() => handleCancelLeave(leave.id)}>{t(lang, '取消申請', 'Cancel', 'Hủy đơn')}</button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {activeRecordTab === 'punch' && (
                  <>
                    <button className="submit-btn" onClick={loadMyPunches} disabled={isLoadingMyPunches}>{isLoadingMyPunches ? t(lang, '查詢中...', 'Loading...', 'Đang tải...') : t(lang, '查詢我的補卡', 'Load My Punches', 'Tải đơn chấm công')}</button>
                    {myPunchMessage && <div className="note-box">{myPunchMessage}</div>}
                    {myPunches.length === 0 ? (
                      <p className="small">{t(lang, '目前沒有補卡紀錄。', 'No punch correction records.', 'Không có bản ghi chấm công.')}</p>
                    ) : (
                      <div className="approval-list">
                        {myPunches.map(punch => (
                          <div className="approval-item" key={punch.id}>
                            <div>
                              <strong>#{punch.id}｜{punch.punch_type}｜{statusText(punch.status, lang)}</strong>
                              <p>{t(lang, '補卡時間', 'Punch Time', 'Giờ chấm công')}：{punch.punch_date} {punch.punch_time}</p>
                              <p>{t(lang, '原因', 'Reason', 'Lý do')}：{punch.reason || t(lang, '未填寫', 'N/A', 'Chưa điền')}</p>
                              <p>{t(lang, '審核主管', 'Approver', 'Người duyệt')}：{approverDisplay(punch.current_approver_no, punch.current_approver_name)}</p>
                              <p>{t(lang, '建立時間', 'Created At', 'Thời gian tạo')}：{punch.created_at}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {activeRecordTab === 'overtime' && (
                  <>
                    <button className="submit-btn" onClick={loadMyOvertimes} disabled={isLoadingMyOvertimes}>{isLoadingMyOvertimes ? t(lang, '查詢中...', 'Loading...', 'Đang tải...') : t(lang, '查詢我的加班', 'Load My Overtime', 'Tải đơn tăng ca')}</button>
                    {myOvertimeMessage && <div className="note-box">{myOvertimeMessage}</div>}
                    {myOvertimes.length === 0 ? (
                      <p className="small">{t(lang, '目前沒有加班紀錄。', 'No overtime records.', 'Không có bản ghi tăng ca.')}</p>
                    ) : (
                      <div className="approval-list">
                        {myOvertimes.map(overtime => (
                          <div className="approval-item" key={overtime.id}>
                            <div>
                              <strong>#{overtime.id}｜{overtime.overtime_type}｜{statusText(overtime.status, lang)}</strong>
                              <p>{t(lang, '加班日期', 'Overtime Date', 'Ngày tăng ca')}：{overtime.overtime_date}</p>
                              <p>{t(lang, '時間', 'Time', 'Thời gian')}：{overtime.start_time} ~ {overtime.end_time}</p>
                              <p>{t(lang, '時數', 'Hours', 'Số giờ')}：{overtime.total_hours} {t(lang, '小時', 'hr(s)', 'giờ')}</p>
                              <p>{t(lang, '原因', 'Reason', 'Lý do')}：{overtime.reason || t(lang, '未填寫', 'N/A', 'Chưa điền')}</p>
                              <p>{t(lang, '審核主管', 'Approver', 'Người duyệt')}：{approverDisplay(overtime.current_approver_no, overtime.current_approver_name)}</p>
                              <p>{t(lang, '建立時間', 'Created At', 'Thời gian tạo')}：{overtime.created_at}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {activeRecordTab === 'attendance' && (
                  <>
                    <button className="submit-btn" onClick={loadAttendance} disabled={isLoadingAttendance}>
                      {isLoadingAttendance ? t(lang, '查詢中...', 'Loading...', 'Đang tải...') : t(lang, '查詢出勤紀錄', 'Load Attendance', 'Tải chấm công')}
                    </button>
                    {attendanceMessage && <div className="note-box">{attendanceMessage}</div>}
                    {attendanceRecords.length === 0 ? (
                      <p className="small">{t(lang, '目前沒有出勤紀錄。', 'No attendance records.', 'Không có bản ghi chấm công.')}</p>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th style={{ border: '1px solid #ddd', padding: '8px' }}>{t(lang, '日期', 'Date', 'Ngày')}</th>
                              <th style={{ border: '1px solid #ddd', padding: '8px' }}>{t(lang, '上班', 'Clock-in', 'Giờ vào')}</th>
                              <th style={{ border: '1px solid #ddd', padding: '8px' }}>{t(lang, '下班', 'Clock-out', 'Giờ ra')}</th>
                              <th style={{ border: '1px solid #ddd', padding: '8px' }}>{t(lang, '請假時數', 'Leave Hours', 'Giờ nghỉ')}</th>
                              <th style={{ border: '1px solid #ddd', padding: '8px' }}>{t(lang, '加班時數', 'OT Hours', 'Giờ tăng ca')}</th>
                              <th style={{ border: '1px solid #ddd', padding: '8px' }}>{t(lang, '狀態', 'Status', 'Trạng thái')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {attendanceRecords.map(row => (
                              <tr key={row.id}>
                                <td style={{ border: '1px solid #ddd', padding: '8px' }}>{row.work_date}</td>
                                <td style={{ border: '1px solid #ddd', padding: '8px' }}>{row.first_punch_time || '-'}</td>
                                <td style={{ border: '1px solid #ddd', padding: '8px' }}>{row.last_punch_time || '-'}</td>
                                <td style={{ border: '1px solid #ddd', padding: '8px' }}>{row.leave_hours ?? '-'}</td>
                                <td style={{ border: '1px solid #ddd', padding: '8px' }}>{row.overtime_hours ?? '-'}</td>
                                <td style={{ border: '1px solid #ddd', padding: '8px' }}>{row.status_note || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          )}

          {/* 待審核區塊 */}
          {activeSection === 'approvals' && canApprove && (
            <section id="approval-section" className="card result-card">
              <h2>{t(lang, '待審核 / 代理審核', 'Pending / Proxy Approval', 'Chờ duyệt / Duyệt thay')}</h2>
              <div className="approval-search">
                <input value={approverNo} readOnly placeholder={t(lang, '主管工號，例如 E010', 'Manager No., e.g. E010', 'Mã quản lý, ví dụ E010')} />
                <button className="submit-btn" onClick={loadPendingApprovals} disabled={isLoadingApprovals}>{isLoadingApprovals ? t(lang, '查詢中...', 'Loading...', 'Đang tải...') : t(lang, '查詢待審核', 'Load Pending', 'Tải danh sách chờ')}</button>
              </div>
              {approvalMessage && <div className="note-box">{approvalMessage}</div>}
              {pendingLeaves.length === 0 && pendingPunches.length === 0 && pendingOvertimes.length === 0 && <p className="small">{t(lang, '目前沒有待審核資料。', 'No pending items.', 'Không có mục nào đang chờ duyệt.')}</p>}

              {pendingLeaves.length > 0 && (
                <>
                  <h3>{t(lang, '待審核假單', 'Pending Leave Requests', 'Đơn nghỉ phép chờ duyệt')}</h3>
                  <div className="approval-list">
                    {pendingLeaves.map(leave => (
                      <div className="approval-item" key={leave.id}>
                        <div>
                          <strong>#{leave.id}｜{leave.employee_no} {leave.employee_name}</strong>
                          <p>{getLeaveTypeDisplayName(leave.leave_type)}｜{leave.start_date} {leave.start_time || ''} ~ {leave.end_date} {leave.end_time || ''}</p>
                          <p>{t(lang, '時數', 'Hours', 'Số giờ')}：{leave.total_hours ?? '-'} {t(lang, '小時', 'hr(s)', 'giờ')}</p>
                          <p>{t(lang, '原因', 'Reason', 'Lý do')}：{leave.reason || t(lang, '未填寫', 'N/A', 'Chưa điền')}</p>
                        </div>
                        <div className="approval-actions">
                          <button className="approve-btn" onClick={() => handleApprovalAction(leave.id, 'approved')}>{t(lang, '核准', 'Approve', 'Duyệt')}</button>
                          <button className="reject-btn" onClick={() => handleApprovalAction(leave.id, 'rejected')}>{t(lang, '駁回', 'Reject', 'Từ chối')}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {pendingPunches.length > 0 && (
                <>
                  <h3>{t(lang, '待審核補卡', 'Pending Punch Corrections', 'Đơn chấm công chờ duyệt')}</h3>
                  <div className="approval-list">
                    {pendingPunches.map(punch => (
                      <div className="approval-item" key={`punch-${punch.id}`}>
                        <div>
                          <strong>{t(lang, '補卡', 'Punch', 'Chấm công')} #{punch.id}｜{punch.employee_no} {punch.employee_name}</strong>
                          <p>{punch.punch_type}｜{punch.punch_date} {punch.punch_time}</p>
                          <p>{t(lang, '原因', 'Reason', 'Lý do')}：{punch.reason || t(lang, '未填寫', 'N/A', 'Chưa điền')}</p>
                          <p>{t(lang, '建立時間', 'Created At', 'Thời gian tạo')}：{punch.created_at}</p>
                        </div>
                        <div className="approval-actions">
                          <button className="approve-btn" onClick={() => handlePunchApprovalAction(punch.id, 'approved')}>{t(lang, '核准', 'Approve', 'Duyệt')}</button>
                          <button className="reject-btn" onClick={() => handlePunchApprovalAction(punch.id, 'rejected')}>{t(lang, '駁回', 'Reject', 'Từ chối')}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {pendingOvertimes.length > 0 && (
                <>
                  <h3>{t(lang, '待審核加班', 'Pending Overtime Requests', 'Đơn tăng ca chờ duyệt')}</h3>
                  <div className="approval-list">
                    {pendingOvertimes.map(ot => (
                      <div className="approval-item" key={`ot-${ot.id}`}>
                        <div>
                          <strong>{t(lang, '加班', 'OT', 'Tăng ca')} #{ot.id}｜{ot.employee_no} {ot.employee_name}</strong>
                          <p>{ot.overtime_type}｜{ot.overtime_date} {ot.start_time}~{ot.end_time}</p>
                          <p>{t(lang, '時數', 'Hours', 'Số giờ')}：{ot.total_hours ?? '-'} {t(lang, '小時', 'hr(s)', 'giờ')}</p>
                          <p>{t(lang, '原因', 'Reason', 'Lý do')}：{ot.reason || t(lang, '未填寫', 'N/A', 'Chưa điền')}</p>
                        </div>
                        <div className="approval-actions">
                          <button className="approve-btn" onClick={() => handleOvertimeApprovalAction(ot.id, 'approved')}>{t(lang, '核准', 'Approve', 'Duyệt')}</button>
                          <button className="reject-btn" onClick={() => handleOvertimeApprovalAction(ot.id, 'rejected')}>{t(lang, '駁回', 'Reject', 'Từ chối')}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {/* HR報表區塊 */}
          {activeSection === 'hr' && canViewHrReport && (
            <section id="hr-section" className="card result-card">
              <h2>{t(lang, 'HR 全部報表', 'All HR Reports', 'Tất cả báo cáo HR')}</h2>
              <div className="approval-search">
                <button className="submit-btn" onClick={loadHrReport} disabled={isLoadingHrLeaves}>{isLoadingHrLeaves ? t(lang, '查詢中...', 'Loading...', 'Đang tải...') : t(lang, '查詢全部報表', 'Load All Reports', 'Tải tất cả báo cáo')}</button>
                <button className="submit-btn" onClick={exportHrLeavesCsv}>{t(lang, '匯出請假報表', 'Export Leave CSV', 'Xuất nghỉ phép CSV')}</button>
                <button className="submit-btn" onClick={exportHrPunchesCsv}>{t(lang, '匯出補卡 / 忘刷報表', 'Export Punch CSV', 'Xuất chấm công CSV')}</button>
                <button className="submit-btn" onClick={exportHrOvertimesCsv}>{t(lang, '匯出加班報表', 'Export Overtime CSV', 'Xuất tăng ca CSV')}</button>
              </div>
              {hrMessage && <div className="note-box">{hrMessage}</div>}
              {hrLeaves.length === 0 && hrPunches.length === 0 && hrOvertimes.length === 0 ? (
                <p className="small">{t(lang, '目前沒有 HR 報表資料。', 'No HR report records found.', 'Không có dữ liệu báo cáo HR.')}</p>
              ) : (
                <>
                  {hrLeaves.length > 0 && (
                    <>
                      <h3>{t(lang, '請假報表', 'Leave Report', 'Báo cáo nghỉ phép')}</h3>
                      <div className="approval-list">
                        {hrLeaves.map(leave => (
                          <div className="approval-item" key={`hr-leave-${leave.id}`}>
                            <div>
                              <strong>#{leave.id}｜{leave.employee_no} {leave.employee_name}｜{statusText(leave.status, lang)}</strong>
                              <p>{getLeaveTypeDisplayName(leave.leave_type)}｜{leave.start_date} {leave.start_time || ''} ~ {leave.end_date} {leave.end_time || ''}</p>
                              <p>{t(lang, '時數', 'Hours', 'Số giờ')}：{leave.total_hours ?? '-'} {t(lang, '小時', 'hr(s)', 'giờ')}</p>
                              <p>{t(lang, '原因', 'Reason', 'Lý do')}：{leave.reason || t(lang, '未填寫', 'N/A', 'Chưa điền')}</p>
                              <p>{t(lang, '審核主管', 'Approver', 'Người duyệt')}：{approverDisplay(leave.current_approver_no, leave.current_approver_name)}</p>
                              <p>{t(lang, '建立時間', 'Created At', 'Thời gian tạo')}：{leave.created_at}</p>
                              {leave.status === 'voided' && <><p>{t(lang, '作廢人員', 'Voided By', 'Người hủy')}：{leave.voided_by_name || '-'}</p><p>{t(lang, '作廢原因', 'Void Reason', 'Lý do hủy')}：{leave.void_reason || '-'}</p></>}
                              {leave.status === 'cancelled' && <><p>{t(lang, '取消人員', 'Cancelled By', 'Người hủy bỏ')}：{leave.cancelled_by_name || '-'}</p><p>{t(lang, '取消原因', 'Cancel Reason', 'Lý do hủy bỏ')}：{leave.cancel_reason || '-'}</p><p>{t(lang, '取消時間', 'Cancelled At', 'Thời gian hủy bỏ')}：{leave.cancelled_at || '-'}</p></>}
                            </div>
                            {leave.status !== 'voided' && <div className="approval-actions"><button className="reject-btn" onClick={() => handleVoidLeave(leave.id)}>{t(lang, '作廢', 'Void', 'Hủy')}</button></div>}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {hrPunches.length > 0 && (
                    <>
                      <h3>{t(lang, '補卡 / 忘刷報表', 'Punch Correction Report', 'Báo cáo bổ sung chấm công')}</h3>
                      <div className="approval-list">
                        {hrPunches.map(punch => (
                          <div className="approval-item" key={`hr-punch-${punch.id}`}>
                            <div>
                              <strong>#{punch.id}｜{punch.employee_no} {punch.employee_name}｜{statusText(punch.status, lang)}</strong>
                              <p>{punch.punch_type}｜{punch.punch_date} {punch.punch_time}</p>
                              <p>{t(lang, '原因', 'Reason', 'Lý do')}：{punch.reason || t(lang, '未填寫', 'N/A', 'Chưa điền')}</p>
                              <p>{t(lang, '審核主管', 'Approver', 'Người duyệt')}：{approverDisplay(punch.current_approver_no, punch.current_approver_name)}</p>
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
                        {hrOvertimes.map(ot => (
                          <div className="approval-item" key={`hr-ot-${ot.id}`}>
                            <div>
                              <strong>#{ot.id}｜{ot.employee_no} {ot.employee_name}｜{statusText(ot.status, lang)}</strong>
                              <p>{ot.overtime_type}｜{ot.overtime_date} {ot.start_time}~{ot.end_time}</p>
                              <p>{t(lang, '時數', 'Hours', 'Số giờ')}：{ot.total_hours ?? '-'} {t(lang, '小時', 'hr(s)', 'giờ')}</p>
                              <p>{t(lang, '原因', 'Reason', 'Lý do')}：{ot.reason || t(lang, '未填寫', 'N/A', 'Chưa điền')}</p>
                              <p>{t(lang, '審核主管', 'Approver', 'Người duyệt')}：{approverDisplay(ot.current_approver_no, ot.current_approver_name)}</p>
                              <p>{t(lang, '建立時間', 'Created At', 'Thời gian tạo')}：{ot.created_at}</p>
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
