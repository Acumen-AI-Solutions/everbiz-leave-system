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

app.post('/api/auth/login', async (c) => {
  const body = await c.req.json<{
    employee_no: string
    pin_code: string
  }>()

  const employeeNo = String(body.employee_no || '').trim().toUpperCase()
  const pinCode = String(body.pin_code || '').trim()

  if (!employeeNo || !pinCode) {
    return jsonResponse(
      {
        ok: false,
        message: '請輸入員工編號與 PIN Code',
      },
      400,
    )
  }

  const user = await c.env.DB
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
      WHERE employee_no = ?
      AND pin_code = ?
      AND is_active = 1
    `)
    .bind(employeeNo, pinCode)
    .first()

  if (!user) {
    return jsonResponse(
      {
        ok: false,
        message: '員工編號或 PIN Code 錯誤',
      },
      401,
    )
  }

  return jsonResponse({
    ok: true,
    user,
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
    start_time: string
    end_date: string
    end_time: string
    total_hours: number
    reason?: string
  }>()

  const employeeNo = String(body.employee_no || '').trim().toUpperCase()
  const name = String(body.name || '').trim()
  const leaveType = String(body.leave_type || '').trim()
  const startDate = String(body.start_date || '').trim()
  const startTime = String(body.start_time || '').trim()
  const endDate = String(body.end_date || '').trim()
  const endTime = String(body.end_time || '').trim()
  const totalHours = Number(body.total_hours || 0)

  if (!employeeNo || !name) {
    return jsonResponse(
      {
        ok: false,
        message: '請輸入員工編號與姓名',
      },
      400,
    )
  }

  if (!leaveType) {
    return jsonResponse(
      {
        ok: false,
        message: '請選擇假別',
      },
      400,
    )
  }

  if (!startDate || !endDate || !startTime || !endTime) {
    return jsonResponse(
      {
        ok: false,
        message: '請輸入完整的開始日期、開始時間、結束日期與結束時間',
      },
      400,
    )
  }

  if (totalHours <= 0) {
    return jsonResponse(
      {
        ok: false,
        message: '請假時數必須大於 0',
      },
      400,
    )
  }

  if ((totalHours * 10) % 5 !== 0) {
    return jsonResponse(
      {
        ok: false,
        message: '請假時數必須以 0.5 小時為單位',
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
        start_time,
        end_date,
        end_time,
        total_hours,
        reason,
        status,
        current_approver_no,
        current_approver_name,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
    .bind(
      employee.employee_no,
      employee.name,
      leaveType,
      startDate,
      startTime,
      endDate,
      endTime,
      totalHours,
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
    total_hours: totalHours,
  })
})

app.get('/api/leave/my', async (c) => {
  const employeeNo = c.req.query('employee_no')

  if (!employeeNo) {
    return jsonResponse(
      {
        ok: false,
        message: '缺少 employee_no',
      },
      400,
    )
  }

  const result = await c.env.DB
    .prepare(`
      SELECT *
      FROM leave_requests
      WHERE employee_no = ?
      ORDER BY created_at DESC
    `)
    .bind(employeeNo.trim().toUpperCase())
    .all()

  return jsonResponse({
    ok: true,
    leaves: result.results,
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
    .bind(approverNo.trim().toUpperCase())
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

  const leaveRequestId = Number(body.leave_request_id || 0)
  const approverEmployeeNo = String(body.approver_employee_no || '')
    .trim()
    .toUpperCase()

  if (!leaveRequestId || !approverEmployeeNo || !body.action) {
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
    .bind(leaveRequestId, approverEmployeeNo)
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
    .bind(body.action, leaveRequestId)
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
      leaveRequestId,
      approverEmployeeNo,
      body.action,
      body.comment || '',
    )
    .run()

  return jsonResponse({
    ok: true,
    message: body.action === 'approved' ? '已核准' : '已駁回',
  })
})

app.get('/api/approvals/history', async (c) => {
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
      ORDER BY updated_at DESC
    `)
    .bind(approverNo.trim().toUpperCase())
    .all()

  return jsonResponse({
    ok: true,
    leaves: result.results,
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
