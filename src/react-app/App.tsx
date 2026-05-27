import './App.css'

function App() {

  const employees = {
    E001: {
      name: "王小明",
      department: "工程部",
      position: "工程師",
      approval_level: 1,
      manager: "E010"
    },
    E010: {
      name: "陳主任",
      department: "工程部",
      position: "主任",
      approval_level: 2,
      manager: "E020"
    },
    E020: {
      name: "林經理",
      department: "工程部",
      position: "經理",
      approval_level: 3,
      manager: "E100"
    },
    E100: {
      name: "張總經理",
      department: "總經理室",
      position: "總經理",
      approval_level: 5,
      manager: ""
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
          <button>首頁</button>
          <button>請假申請</button>
          <button>待審核</button>
          <button>HR報表</button>
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

          <p className="eyebrow">
            EVERBIZ INTERNAL HR SYSTEM
          </p>

          <h1>請假申請系統 Demo</h1>

          <p>
            React + Cloudflare Workers + RWD + PWA
          </p>

        </div>

        <div className="badge">
          PWA
        </div>

      </header>

      <div className="grid">

        <section className="card">

          <h2>請假申請</h2>

          <input placeholder="員工編號 例如 E001" />

          <select>
            <option>特休</option>
            <option>事假</option>
            <option>病假</option>
            <option>公假</option>
          </select>

          <div className="two">

            <input type="date" />

            <input type="date" />

          </div>

          <textarea
            rows={5}
            placeholder="請假原因"
          />

          <button className="submit-btn">
            送出假單
          </button>

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

    </div>
  )
}

export default App
