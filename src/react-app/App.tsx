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
  endDate: string
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
  end_date: string
  reason: string
  status: string
  current_approver_no: string
  current_approver_name: string
  created_at: string
  updated_at: string
}

const employees: Record<string, Employee> = {
  E001: {
    name: '王小明',
    department: '工程部',
    position: '工程師',
    approval_level: 1,
    manager: 'E010',
  },
  E010: {
    name: '陳主任',
    department: '工程部',
    position: '主任',
    approval_level: 2,
    manager: 'E020',
  },
  E020: {
    name: '林經理',
    department: '工程部',
    position: '經理',
    approval_level: 3,
    manager: 'E100',
  },
  E100: {
    name: '張總經理',
    department: '總經理室',
    position: '總經理',
    approval_level: 5,
    manager: '',
  },
  E900: {
    name: '人資管理員',
    department: '人資部',
    position: 'HR',
    approval_level: 4,
    manager: 'E100',
  },
}

function App() {
  const [loginEmployeeNo, setLoginEmployeeNo] = useState('')
  const [pinCode, setPinCode] = useState('')
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  const [employeeNo, setEmployeeNo] = useState('')
  const [employeeName, setEmployeeName] = useState('')
  const [leaveType, setLeaveType] = useState('特休')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<LeaveResult | null>(null)

  const [approverNo, setApproverNo] = useState('')
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRecord[]>([])
  const [approvalMessage, setApprovalMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingApprovals, setIsLoadingApprovals] = useState(false)

  const [myLeaves, setMyLeaves] = useState<LeaveRecord[]>([])
  const [myLeaveMessage, setMyLeaveMessage] = useState('')
  const [isLoadingMyLeaves, setIsLoadingMyLeaves] = useState(false)

  const [hrLeaves, setHrLeaves] = useState<LeaveRecord[]>([])
  const [hrMessage, setHrMessage] = useState('')
  const [isLoadingHrLeaves, setIsLoadingHrLeaves] = useState(false)

  const canApprove =
    currentUser?.system_role === 'manager' ||
    currentUser?.system_role === 'general_manager' ||
    currentUser?.system_role === 'hr'

  const canViewHrReport =
    currentUser?.system_role === 'hr' ||
    currentUser?.system_role === 'general_manager'

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedEmployeeNo = loginEmployeeNo.trim().toUpperCase()
    const normalizedPinCode = pinCode.trim()

    if (!normalizedEmployeeNo || !normalizedPinCode) {
      setLoginError('請輸入員工編號與 PIN Code')
      return
    }

    setIsLoggingIn(true)
    setLoginError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employee_no: normalizedEmployeeNo,
          pin_code: normalizedPinCode,
        }),
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
      setMyLeaves([])
      setHrLeaves([])
      setResult(null)
    } catch (err) {
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
    setMyLeaves([])
    setHrLeaves([])
    setApprovalMessage('')
    setMyLeaveMessage('')
    setHrMessage('')
    setResult(null)
    setError('')
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedEmployeeNo = employeeNo.trim().toUpperCase()
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

    setIsSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/leave/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employee_no: normalizedEmployeeNo,
          name: normalizedEmployeeName,
          leave_type: leaveType,
          start_date: startDate,
          end_date: endDate,
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
        department: employee?.department || currentUser?.department || '由資料庫判斷',
        position: employee?.position || currentUser?.position || '由資料庫判斷',
        approvalLevel: employee?.approval_level || currentUser?.approval_level || 0,
        leaveType,
        startDate,
        endDate,
        reason,
        currentApproverNo: data.current_approver_no,
        currentApproverName: data.current_approver_name,
        leaveRequestId: data.leave_request_id,
      })

      setReason('')
      setError('')
      await loadMyLeavesSilent()
    } catch (err) {
      setError('送出失敗，請確認後端 API 是否正常')
      setResult(null)
    } finally {
      setIsSubmitting(false)
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
        return
      }

      setPendingLeaves(data.leaves || [])
      setApprovalMessage(`已載入 ${data.leaves?.length || 0} 筆待審核假單`)
    } catch (err) {
      setApprovalMessage('查詢失敗，請確認 API 是否正常')
      setPendingLeaves([])
    } finally {
      setIsLoadingApprovals(false)
    }
  }

  async function handleApprovalAction(
    leaveRequestId: number,
    action: 'approved' | 'rejected',
  ) {
    const normalizedApproverNo = approverNo.trim().toUpperCase()

    if (!normalizedApproverNo) {
      setApprovalMessage('請輸入主管工號')
      return
    }

    const actionText = action === 'approved' ? '核准' : '駁回'

    if (!window.confirm(`確定要${actionText}這張假單嗎？`)) {
      return
    }

    setApprovalMessage(`${actionText}處理中...`)

    try {
      const response = await fetch('/api/approvals/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leave_request_id: leaveRequestId,
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

      if (canViewHrReport) {
        await loadHrLeavesSilent()
      }
    } catch (err) {
      setApprovalMessage('審核失敗，請確認 API 是否正常')
    }
  }

  async function loadMyLeavesSilent() {
    if (!currentUser) return

    try {
      const response = await fetch(
        `/api/leave/my?employee_no=${encodeURIComponent(currentUser.employee_no)}`,
      )

      const data = await response.json()

      if (data.ok) {
        setMyLeaves(data.leaves || [])
      }
    } catch (err) {
      // silent refresh only
    }
  }

  async function loadMyLeaves() {
    if (!currentUser) return

    setIsLoadingMyLeaves(true)
    setMyLeaveMessage('查詢中...')

    try {
      const response = await fetch(
        `/api/leave/my?employee_no=${encodeURIComponent(currentUser.employee_no)}`,
      )

      const data = await response.json()

      if (!data.ok) {
        setMyLeaveMessage(data.message || '查詢我的假單失敗')
        setMyLeaves([])
        return
      }

      setMyLeaves(data.leaves || [])
      setMyLeaveMessage(`已載入 ${data.leaves?.length || 0} 筆我的假單`)
    } catch (err) {
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

      if (data.ok) {
        setHrLeaves(data.leaves || [])
      }
    } catch (err) {
      // silent refresh only
    }
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
    } catch (err) {
      setHrMessage('查詢失敗，請確認 API 是否正常')
      setHrLeaves([])
    } finally {
      setIsLoadingHrLeaves(false)
    }
  }

  function statusText(status: string) {
    if (status === 'pending') return '待審核'
    if (status === 'approved') return '已核准'
    if (status === 'rejected') return '已駁回'
    return status
  }

  return (
    <div className="page">
      <nav className="top-nav">
        <div className="brand">
          <img
            src="https://pub-531c96b02ed745e0bbfd0e96bfde8518.r2.dev/EBC.png"
            alt="EBC"
          />

          <div>
            <strong>Everbiz</strong>
            <small>Leave Management</small>
          </div>
        </div>

        {currentUser && (
          <div className="menu">
            <button type="button">首頁</button>
            <button type="button">請假申請</button>
            <button type="button">我的假單</button>
            {canApprove && <button type="button">待審核</button>}
            {canViewHrReport && <button type="button">HR報表</button>}
            <button type="button" onClick={handleLogout}>
              登出
            </button>
          </div>
        )}
      </nav>

      {!currentUser && (
        <section className="card login-card">
          <h2>身分確認</h2>

          {loginError && <div className="alert">{loginError}</div>}

          <form onSubmit={handleLogin}>
            <input
              value={loginEmployeeNo}
              onChange={(event) => setLoginEmployeeNo(event.target.value)}
              placeholder="員工編號，例如 E010"
            />

            <input
              value={pinCode}
              onChange={(event) => setPinCode(event.target.value)}
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

      {currentUser && (
        <>
          <section className="card user-card">
            <h2>目前登入</h2>

            <div className="summary">
              <div>
                <span>員工</span>
                <strong>
                  {currentUser.employee_no} {currentUser.name}
                </strong>
              </div>

              <div>
                <span>部門</span>
                <strong>{currentUser.department}</strong>
              </div>

              <div>
                <span>職稱</span>
                <strong>{currentUser.position}</strong>
              </div>

              <div>
                <span>角色</span>
                <strong>{currentUser.system_role}</strong>
              </div>

              <div>
                <span>簽核層級</span>
                <strong>{currentUser.approval_level}</strong>
              </div>
            </div>
          </section>

          <header className="hero">
            <div className="hero-left">
              <div className="logo-wrap">
                <img
                  src="https://pub-531c96b02ed745e0bbfd0e96bfde8518.r2.dev/EBC.png"
                  alt="EBC"
                />
              </div>

              <p className="eyebrow">EVERBIZ INTERNAL HR SYSTEM</p>

              <h1>請假申請系統 Demo</h1>

              <p>React + Cloudflare Workers + D1 Database + RWD + PWA</p>
            </div>

            <div className="badge">PWA</div>
          </header>

          <div className="grid">
            <section className="card">
              <h2>請假申請</h2>

              {error && <div className="alert">{error}</div>}

              <form onSubmit={handleSubmit}>
                <input value={employeeNo} readOnly placeholder="員工編號" />

                <input value={employeeName} readOnly placeholder="姓名" />

                <select
                  value={leaveType}
                  onChange={(event) => setLeaveType(event.target.value)}
                >
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
                    onChange={(event) => setStartDate(event.target.value)}
                  />

                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                  />
                </div>

                <textarea
                  rows={5}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="請假原因"
                />

                <button
                  className="submit-btn"
                  type="submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? '送出中...' : '送出假單'}
                </button>
              </form>
            </section>

            <section className="card">
              <h2>員工資料</h2>

              <table>
                <thead>
                  <tr>
                    <th>編號</th>
                    <th>姓名</th>
                    <th>職稱</th>
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

          {result && (
            <section className="card result-card">
              <h2>假單送出結果</h2>

              <div className="summary">
                <div>
                  <span>假單編號</span>
                  <strong>{result.leaveRequestId || '-'}</strong>
                </div>

                <div>
                  <span>員工</span>
                  <strong>
                    {result.employeeNo} {result.employeeName}
                  </strong>
                </div>

                <div>
                  <span>假別</span>
                  <strong>{result.leaveType}</strong>
                </div>

                <div>
                  <span>期間</span>
                  <strong>
                    {result.startDate} ~ {result.endDate}
                  </strong>
                </div>

                <div>
                  <span>目前審核主管</span>
                  <strong>
                    {result.currentApproverName} / {result.currentApproverNo}
                  </strong>
                </div>
              </div>

              <p className="small">
                假單已寫入 D1 資料庫，主管可在「主管待審核」區查詢並核准或駁回。
              </p>
            </section>
          )}

          <section className="card result-card">
            <h2>我的假單</h2>

            <button
              className="submit-btn"
              type="button"
              onClick={loadMyLeaves}
              disabled={isLoadingMyLeaves}
            >
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
                      <strong>
                        #{leave.id}｜{leave.leave_type}｜{statusText(leave.status)}
                      </strong>

                      <p>
                        日期：{leave.start_date} ~ {leave.end_date}
                      </p>

                      <p>原因：{leave.reason || '未填寫'}</p>

                      <p>
                        審核主管：{leave.current_approver_name} /{' '}
                        {leave.current_approver_no}
                      </p>

                      <p>建立時間：{leave.created_at}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {canApprove && (
            <section className="card result-card">
              <h2>主管待審核</h2>

              <div className="approval-search">
                <input
                  value={approverNo}
                  readOnly
                  placeholder="主管工號，例如 E010"
                />

                <button
                  className="submit-btn"
                  type="button"
                  onClick={loadPendingApprovals}
                  disabled={isLoadingApprovals}
                >
                  {isLoadingApprovals ? '查詢中...' : '查詢待審核'}
                </button>
              </div>

              {approvalMessage && (
                <div className="note-box">{approvalMessage}</div>
              )}

              {pendingLeaves.length === 0 ? (
                <p className="small">目前沒有待審核假單。</p>
              ) : (
                <div className="approval-list">
                  {pendingLeaves.map((leave) => (
                    <div className="approval-item" key={leave.id}>
                      <div>
                        <strong>
                          #{leave.id}｜{leave.employee_no} {leave.employee_name}
                        </strong>

                        <p>
                          {leave.leave_type}｜{leave.start_date} ~{' '}
                          {leave.end_date}
                        </p>

                        <p>原因：{leave.reason || '未填寫'}</p>

                        <p>狀態：{statusText(leave.status)}</p>

                        <p>
                          目前審核：{leave.current_approver_name} /{' '}
                          {leave.current_approver_no}
                        </p>
                      </div>

                      <div className="approval-actions">
                        <button
                          type="button"
                          className="approve-btn"
                          onClick={() =>
                            handleApprovalAction(leave.id, 'approved')
                          }
                        >
                          核准
                        </button>

                        <button
                          type="button"
                          className="reject-btn"
                          onClick={() =>
                            handleApprovalAction(leave.id, 'rejected')
                          }
                        >
                          駁回
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {canViewHrReport && (
            <section className="card result-card">
              <h2>HR 全部請假資料</h2>

              <button
                className="submit-btn"
                type="button"
                onClick={loadHrLeaves}
                disabled={isLoadingHrLeaves}
              >
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
                        <strong>
                          #{leave.id}｜{leave.employee_no} {leave.employee_name}｜{statusText(leave.status)}
                        </strong>

                        <p>
                          {leave.leave_type}｜{leave.start_date} ~{' '}
                          {leave.end_date}
                        </p>

                        <p>原因：{leave.reason || '未填寫'}</p>

                        <p>
                          審核主管：{leave.current_approver_name} /{' '}
                          {leave.current_approver_no}
                        </p>

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
