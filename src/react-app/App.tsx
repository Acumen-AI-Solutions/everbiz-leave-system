import { useState } from 'react'
import './App.css'

type Employee = {
  name: string
  department: string
  position: string
  approval_level: number
  manager: string
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

type PendingLeave = {
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
}

function App() {
  const [employeeNo, setEmployeeNo] = useState('')
  const [employeeName, setEmployeeName] = useState('')
  const [leaveType, setLeaveType] = useState('特休')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<LeaveResult | null>(null)

  const [approverNo, setApproverNo] = useState('E010')
  const [pendingLeaves, setPendingLeaves] = useState<PendingLeave[]>([])
  const [approvalMessage, setApprovalMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingApprovals, setIsLoadingApprovals] = useState(false)

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
    } catch (err) {
      setApprovalMessage('審核失敗，請確認 API 是否正常')
    }
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
        department: employee?.department || '由資料庫判斷',
        position: employee?.position || '由資料庫判斷',
        approvalLevel: employee?.approval_level || 0,
        leaveType,
        startDate,
        endDate,
        reason,
        currentApproverNo: data.current_approver_no,
        currentApproverName: data.current_approver_name,
        leaveRequestId: data.leave_request_id,
      })

      setError('')
    } catch (err) {
      setError('送出失敗，請確認後端 API 是否正常')
      setResult(null)
    } finally {
      setIsSubmitting(false)
    }
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

        <div className="menu">
          <button type="button">首頁</button>
          <button type="button">請假申請</button>
          <button type="button">待審核</button>
          <button type="button">HR報表</button>
        </div>
      </nav>

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
            <input
              value={employeeNo}
              onChange={(event) => setEmployeeNo(event.target.value)}
              placeholder="員工編號，例如 E001"
            />

            <input
              value={employeeName}
              onChange={(event) => setEmployeeName(event.target.value)}
              placeholder="姓名，例如 王小明"
            />

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

            <button className="submit-btn" type="submit" disabled={isSubmitting}>
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

          <h3>系統判斷簽核流程</h3>

          <ol className="flow">
            <li>
              {result.currentApproverName}（{result.currentApproverNo}）
            </li>
          </ol>

          <p className="small">
            假單已寫入 D1 資料庫，主管可在「主管待審核」區查詢並核准或駁回。
          </p>
        </section>
      )}

      <section className="card result-card">
        <h2>主管待審核</h2>

        <div className="approval-search">
          <input
            value={approverNo}
            onChange={(event) => setApproverNo(event.target.value)}
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

        {approvalMessage && <div className="note-box">{approvalMessage}</div>}

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
                    {leave.leave_type}｜{leave.start_date} ~ {leave.end_date}
                  </p>

                  <p>原因：{leave.reason || '未填寫'}</p>

                  <p>狀態：{leave.status}</p>

                  <p>
                    目前審核：{leave.current_approver_name} /{' '}
                    {leave.current_approver_no}
                  </p>
                </div>

                <div className="approval-actions">
                  <button
                    type="button"
                    className="approve-btn"
                    onClick={() => handleApprovalAction(leave.id, 'approved')}
                  >
                    核准
                  </button>

                  <button
                    type="button"
                    className="reject-btn"
                    onClick={() => handleApprovalAction(leave.id, 'rejected')}
                  >
                    駁回
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default App
