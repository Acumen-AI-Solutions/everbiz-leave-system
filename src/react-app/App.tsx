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
  employee: Employee
  leaveType: string
  startDate: string
  endDate: string
  reason: string
  flow: string[]
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
  const [leaveType, setLeaveType] = useState('特休')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<LeaveResult | null>(null)

  function getApprovalFlow(employee: Employee) {
    const managerNo = employee.manager
    const manager = managerNo ? employees[managerNo] : null

    const nextApprover = manager
      ? `${manager.name}（${manager.position} / ${managerNo}）`
      : 'HR 留存 / 最高主管核備'

    if (employee.approval_level <= 1) {
      return [nextApprover]
    }

    if (employee.approval_level === 2) {
      return [nextApprover, '總經理']
    }

    if (employee.approval_level >= 3 && employee.approval_level < 5) {
      return ['總經理']
    }

    return ['HR 留存']
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedEmployeeNo = employeeNo.trim().toUpperCase()
    const employee = employees[normalizedEmployeeNo]

    if (!employee) {
      setError('查無此員工編號，請確認 HR 員工資料。可測試：E001、E010、E020、E100')
      setResult(null)
      return
    }

    if (!startDate || !endDate) {
      setError('請選擇開始日期與結束日期。')
      setResult(null)
      return
    }

    setError('')
    setResult({
      employeeNo: normalizedEmployeeNo,
      employee,
      leaveType,
      startDate,
      endDate,
      reason,
      flow: getApprovalFlow(employee),
    })
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

          <p>React + Cloudflare Workers + RWD + PWA</p>
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
              placeholder="員工編號 例如 E001"
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

            <button className="submit-btn" type="submit">
              送出假單
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
              <span>員工</span>
              <strong>
                {result.employeeNo} {result.employee.name}
              </strong>
            </div>

            <div>
              <span>部門 / 職稱</span>
              <strong>
                {result.employee.department} / {result.employee.position}
              </strong>
            </div>

            <div>
              <span>簽核層級</span>
              <strong>{result.employee.approval_level}</strong>
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
          </div>

          <h3>系統判斷簽核流程</h3>

          <ol className="flow">
            {result.flow.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          <p className="small">
            Demo 已可送出並顯示簽核流程。下一階段才會接資料庫，真正寫入請假紀錄。
          </p>
        </section>
      )}
    </div>
  )
}

export default App
