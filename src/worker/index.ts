import { Hono } from 'hono'

type Env = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Env }>()

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

app.options('*', () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
})

app.get('/api/employees', async (c) => {
  const result = await c.env.DB
    .prepare(`
      SELECT
        employee_no,
        name,
        department,
        position,
        approval_level,
        manager_employee_no,
        system_role,
        is_active
      FROM employees
      ORDER BY employee_no ASC
    `)
    .all()

  return jsonResponse({
    ok: true,
    employees: result.results,
  })
})

app.post('/api/leave/create', async (c) => {
  const body = await c.req.json<{
    employee_no: string
    name: string
    leave_type: string
    start_date: string
    end_date: string
    reason?: string
  }>()

  const employeeNo = String(body.employee_no || '').trim().toUpperCase()
  const name = String(body.name || '').trim()

  if (!employeeNo || !name) {
    return jsonResponse(
      {
        ok: false,
        message: '請輸入員工編號與姓名',
      },
      400,
    )
  }

  const employee = await c.env.DB
    .prepare(`
      SELECT *
      FROM employees
      WHERE employee_no = ?
      AND name = ?
      AND is_active = 1
    `)
    .bind(employeeNo, name)
    .first<{
      employee_no: string
      name: string
      department: string
      position: string
      approval_level: number
      manager_employee_no: string | null
    }>()

  if (!employee) {
    return jsonResponse(
      {
        ok: false,
        message: '查無此員工，或姓名與員工編號不符合',
      },
      404,
    )
  }

  const approverNo = employee.manager_employee_no || ''

  let approverName = 'HR 留存'

  if (approverNo) {
    const approver = await c.env.DB
      .prepare(`
        SELECT name
        FROM employees
        WHERE employee_no = ?
      `)
      .bind(approverNo)
      .first<{ name: string }>()

    if (approver) {
      approverName = approver.name
    }
  }

  const insertResult = await c.env.DB
    .prepare(`
      INSERT INTO leave_requests
      (
        employee_no,
        employee_name,
        leave_type,
        start_date,
        end_date,
        reason,
        status,
        current_approver_no,
        current_approver_name,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
    .bind(
      employee.employee_no,
      employee.name,
      body.leave_type,
      body.start_date,
      body.end_date,
      body.reason || '',
      approverNo,
      approverName,
    )
    .run()

  return jsonResponse({
    ok: true,
    message: '請假單已送出',
    leave_request_id: insertResult.meta.last_row_id,
    current_approver_no: approverNo,
    current_approver_name: approverName,
  })
})

app.get('/api/approvals/pending', async (c) => {
  const approverNo = c.req.query('approver_no')

  if (!approverNo) {
    return jsonResponse(
      {
        ok: false,
        message: '缺少 approver_no',
      },
      400,
    )
  }

  const result = await c.env.DB
    .prepare(`
      SELECT *
      FROM leave_requests
      WHERE current_approver_no = ?
      AND status = 'pending'
      ORDER BY created_at DESC
    `)
    .bind(approverNo)
    .all()

  return jsonResponse({
    ok: true,
    leaves: result.results,
  })
})

app.post('/api/approvals/action', async (c) => {
  const body = await c.req.json<{
    leave_request_id: number
    approver_employee_no: string
    action: 'approved' | 'rejected'
    comment?: string
  }>()

  if (!body.leave_request_id || !body.approver_employee_no || !body.action) {
    return jsonResponse(
      {
        ok: false,
        message: '缺少必要欄位',
      },
      400,
    )
  }

  if (!['approved', 'rejected'].includes(body.action)) {
    return jsonResponse(
      {
        ok: false,
        message: 'action 只能是 approved 或 rejected',
      },
      400,
    )
  }

  const leave = await c.env.DB
    .prepare(`
      SELECT *
      FROM leave_requests
      WHERE id = ?
      AND current_approver_no = ?
      AND status = 'pending'
    `)
    .bind(body.leave_request_id, body.approver_employee_no)
    .first()

  if (!leave) {
    return jsonResponse(
      {
        ok: false,
        message: '查無待審核假單，或此主管無審核權限',
      },
      404,
    )
  }

  await c.env.DB
    .prepare(`
      UPDATE leave_requests
      SET status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(body.action, body.leave_request_id)
    .run()

  await c.env.DB
    .prepare(`
      INSERT INTO leave_approval_logs
      (
        leave_request_id,
        approver_employee_no,
        action,
        comment,
        created_at
      )
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `)
    .bind(
      body.leave_request_id,
      body.approver_employee_no,
      body.action,
      body.comment || '',
    )
    .run()

  return jsonResponse({
    ok: true,
    message: body.action === 'approved' ? '已核准' : '已駁回',
  })
})

app.get('/api/hr/leaves', async (c) => {
  const result = await c.env.DB
    .prepare(`
      SELECT *
      FROM leave_requests
      ORDER BY created_at DESC
    `)
    .all()

  return jsonResponse({
    ok: true,
    leaves: result.results,
  })
})

app.get('/', (c) => {
  return c.text('Everbiz leave system API is running.')
})

export default app
