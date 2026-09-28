/**
 * Self-contained HTML for setup / login / admin (Chinese-friendly, mobile-usable).
 */

const CSS = `
:root { color-scheme: light dark; --bg:#0f1419; --card:#1a2332; --fg:#e7ecf3; --muted:#8b9bb4; --acc:#3b82f6; --danger:#ef4444; --ok:#22c55e; --bd:#2a3648; }
@media (prefers-color-scheme: light) {
  :root { --bg:#f4f6f9; --card:#fff; --fg:#1a2332; --muted:#5a6a80; --bd:#d8dee8; }
}
* { box-sizing: border-box; }
body { margin:0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Noto Sans SC", sans-serif;
  background: var(--bg); color: var(--fg); min-height: 100vh; display:flex; align-items:center; justify-content:center; padding: 1rem; }
.card { width:100%; max-width: 420px; background: var(--card); border:1px solid var(--bd); border-radius: 12px; padding: 1.5rem; box-shadow: 0 8px 24px rgba(0,0,0,.15); }
.card.wide { max-width: 720px; }
h1 { font-size: 1.25rem; margin: 0 0 .25rem; }
.sub { color: var(--muted); font-size: .9rem; margin-bottom: 1.25rem; }
label { display:block; font-size:.85rem; margin: .75rem 0 .35rem; color: var(--muted); }
input, select { width:100%; padding:.65rem .75rem; border-radius:8px; border:1px solid var(--bd); background: transparent; color: var(--fg); font-size: 1rem; }
button, .btn { display:inline-flex; align-items:center; justify-content:center; gap:.4rem; width:100%; margin-top: 1rem; padding:.7rem 1rem;
  border:none; border-radius:8px; background: var(--acc); color:#fff; font-size:1rem; font-weight:600; cursor:pointer; text-decoration:none; }
button.secondary, .btn.secondary { background: transparent; border:1px solid var(--bd); color: var(--fg); }
button.danger { background: var(--danger); }
button:disabled { opacity:.6; cursor:not-allowed; }
.err { color: var(--danger); font-size:.9rem; margin-top:.75rem; min-height:1.2em; }
.ok { color: var(--ok); font-size:.9rem; margin-top:.75rem; }
.row { display:flex; gap:.5rem; flex-wrap:wrap; }
.row button, .row .btn { width:auto; margin-top:0; padding:.4rem .75rem; font-size:.85rem; }
table { width:100%; border-collapse: collapse; font-size:.9rem; margin-top:1rem; }
th, td { text-align:left; padding:.55rem .4rem; border-bottom:1px solid var(--bd); vertical-align: middle; }
th { color: var(--muted); font-weight:600; }
.badge { display:inline-block; padding:.1rem .45rem; border-radius:999px; font-size:.75rem; background: var(--bd); }
.badge.admin { background: #1d4ed8; color:#fff; }
.badge.off { background: var(--danger); color:#fff; }
.topbar { display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap; margin-bottom:.5rem; }
.topbar a { color: var(--acc); font-size:.9rem; }
.form-inline { display:grid; grid-template-columns: 1fr 1fr auto; gap:.5rem; margin-top:1rem; align-items:end; }
@media (max-width:560px) { .form-inline { grid-template-columns: 1fr; } }
.hint { font-size:.8rem; color: var(--muted); margin-top:.5rem; }
`

function shell(title, body, { wide = false } = {}) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="card${wide ? ' wide' : ''}">
${body}
</div>
</body>
</html>`
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function setupPage({ error = '', username = '' } = {}) {
  return shell(
    '创建管理员',
    `<h1>首次设置</h1>
<p class="sub">尚未创建用户。请设置管理员账号（密码至少 8 位）。</p>
<form method="POST" action="/auth/setup" autocomplete="off">
  <label for="username">用户名</label>
  <input id="username" name="username" required minlength="2" maxlength="64" value="${escapeHtml(username)}" autofocus/>
  <label for="password">密码</label>
  <input id="password" name="password" type="password" required minlength="8" maxlength="200"/>
  <label for="password2">确认密码</label>
  <input id="password2" name="password2" type="password" required minlength="8" maxlength="200"/>
  <button type="submit">创建管理员</button>
  <div class="err">${escapeHtml(error)}</div>
</form>`,
  )
}

export function loginPage({ error = '', username = '', next = '/' } = {}) {
  return shell(
    '登录',
    `<h1>登录</h1>
<p class="sub">DeepSeek Harness 网关</p>
<form method="POST" action="/auth/login" autocomplete="username">
  <input type="hidden" name="next" value="${escapeHtml(next)}"/>
  <label for="username">用户名</label>
  <input id="username" name="username" required value="${escapeHtml(username)}" autofocus/>
  <label for="password">密码</label>
  <input id="password" name="password" type="password" required/>
  <button type="submit">登录</button>
  <div class="err">${escapeHtml(error)}</div>
</form>`,
  )
}

export function adminPage({ users = [], me = '', error = '', ok = '' } = {}) {
  const rows = users
    .map((u) => {
      const badges = [
        `<span class="badge${u.role === 'admin' ? ' admin' : ''}">${escapeHtml(u.role)}</span>`,
        u.disabled ? '<span class="badge off">已禁用</span>' : '',
      ]
        .filter(Boolean)
        .join(' ')
      const isSelf = u.username === me
      return `<tr>
  <td>${escapeHtml(u.username)} ${badges}</td>
  <td class="row">
    <form method="POST" action="/auth/admin/toggle" style="display:inline">
      <input type="hidden" name="username" value="${escapeHtml(u.username)}"/>
      <input type="hidden" name="disabled" value="${u.disabled ? '0' : '1'}"/>
      <button type="submit" class="secondary" ${isSelf ? 'disabled' : ''}>${u.disabled ? '启用' : '禁用'}</button>
    </form>
    <form method="POST" action="/auth/admin/reset" style="display:inline" onsubmit="return promptReset(this)">
      <input type="hidden" name="username" value="${escapeHtml(u.username)}"/>
      <input type="hidden" name="password" value=""/>
      <button type="submit" class="secondary">重置密码</button>
    </form>
    <form method="POST" action="/auth/admin/delete" style="display:inline" onsubmit="return confirm('确认删除 ${escapeHtml(u.username)}？')">
      <input type="hidden" name="username" value="${escapeHtml(u.username)}"/>
      <button type="submit" class="danger" ${u.role === 'admin' && users.filter((x) => x.role === 'admin').length <= 1 ? 'disabled' : ''}>删除</button>
    </form>
  </td>
</tr>`
    })
    .join('\n')

  return shell(
    '用户管理',
    `<div class="topbar">
  <div>
    <h1>用户管理</h1>
    <p class="sub" style="margin:0">当前：${escapeHtml(me)}（管理员）</p>
  </div>
  <div class="row">
    <a class="btn secondary" href="/">返回应用</a>
    <form method="POST" action="/auth/logout" style="margin:0"><button type="submit" class="secondary">退出</button></form>
  </div>
</div>
${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
${ok ? `<div class="ok">${escapeHtml(ok)}</div>` : ''}
<table>
  <thead><tr><th>用户</th><th>操作</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="2">暂无用户</td></tr>'}</tbody>
</table>
<h2 style="font-size:1rem;margin:1.5rem 0 .5rem">创建用户</h2>
<form method="POST" action="/auth/admin/create" class="form-inline" autocomplete="off">
  <div>
    <label for="nu">用户名</label>
    <input id="nu" name="username" required minlength="2"/>
  </div>
  <div>
    <label for="np">密码</label>
    <input id="np" name="password" type="password" required minlength="8"/>
  </div>
  <div>
    <label for="nr">角色</label>
    <select id="nr" name="role"><option value="user">user</option><option value="admin">admin</option></select>
  </div>
  <button type="submit">创建</button>
</form>
<p class="hint">所有账号共享同一官方 dsh 进程与工作区 <code>/home/share</code>。本页仅做访问门禁。</p>
<script>
function promptReset(form) {
  const p = prompt('新密码（至少 8 位）：');
  if (!p || p.length < 8) { alert('密码至少 8 位'); return false; }
  form.password.value = p;
  return true;
}
</script>`,
    { wide: true },
  )
}

export function redirectHtml(location) {
  return `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${escapeHtml(location)}"/></head><body></body></html>`
}
