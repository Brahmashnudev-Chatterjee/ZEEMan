/* Phase 6: employee read-only milestone visibility for allocated projects. */
(() => {
  let mountedKey = ''; let mounting = false;
  const esc = (v = '') => String(v).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const label = v => String(v || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  const date = v => v ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(`${String(v).slice(0, 10)}T12:00:00`)) : '—';
  const api = async path => { const response = await fetch(`/api${path}`, { credentials: 'same-origin' }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.message || 'Request failed.'); return body; };
  async function mount() {
    const match = location.pathname.match(/^\/user\/projects\/(\d+)$/); if (!match || mounting) return;
    const projectId = match[1], host = document.querySelector('#app .content'); if (!host) return;
    const key = `${projectId}:${host.children.length}`; if (host.querySelector('[data-user-milestones-panel]')) { mountedKey = key; return; }
    mounting = true;
    try {
      const list = await api(`/projects/${projectId}/milestones`);
      if (location.pathname !== `/user/projects/${projectId}` || document.querySelector('#app .content') !== host) return;
      const details = await Promise.all((list.milestones || []).map(item => api(`/projects/${projectId}/milestones/${item.id}`)));
      const panel = document.createElement('section'); panel.className = 'panel milestones-panel user-milestones-panel'; panel.dataset.userMilestonesPanel = 'true';
      panel.innerHTML = `<div class="section-title"><div><p class="eyebrow">Project delivery</p><h2>Milestones</h2><p>Milestones are planned by your administrator. Linked task progress updates automatically as project work is completed.</p></div></div><div class="milestone-list">${details.length ? details.map(({ milestone, tasks }) => `<article class="milestone-card read-only ${milestone.is_overdue ? 'is-overdue' : ''}"><header class="milestone-card-header"><div><div class="milestone-title-row"><h3>${esc(milestone.title)}</h3>${milestone.is_overdue ? '<span class="milestone-overdue">Overdue</span>' : ''}</div><p>${esc(milestone.description || 'No description')}</p></div></header><div class="milestone-meta"><span class="pill ${esc(milestone.status)}">${label(milestone.status)}</span><span>Due ${date(milestone.due_date)}</span><span>${milestone.days_remaining === null ? 'No deadline' : milestone.days_remaining < 0 ? `${Math.abs(milestone.days_remaining)} days late` : `${milestone.days_remaining} days remaining`}</span></div><div class="milestone-progress"><div><strong>${milestone.progress}% task progress</strong><small>${milestone.completed_tasks}/${milestone.task_count} linked project tasks completed</small></div><div class="progress-line"><span style="width:${milestone.progress}%"></span></div></div><ul class="milestone-linked-tasks">${tasks.length ? tasks.map(task => `<li><a href="/user/tasks/${task.id}" data-user-ms-task="${task.id}"><strong>${esc(task.title)}</strong><small>${esc(task.user_name || 'Unassigned')} · ${label(task.status)} · ${date(task.due_date)}</small></a></li>`).join('') : '<li class="milestone-empty">No project tasks linked yet.</li>'}</ul></article>`).join('') : '<div class="empty"><h3>No milestones have been planned yet</h3><p>Your administrator will share delivery milestones when they are available.</p></div>'}</div>`;
      host.append(panel); mountedKey = key;
      panel.querySelectorAll('[data-user-ms-task]').forEach(link => link.onclick = event => { event.preventDefault(); history.pushState({}, '', `/user/tasks/${link.dataset.userMsTask}`); window.dispatchEvent(new PopStateEvent('popstate')); });
    } catch (error) { if (location.pathname === `/user/projects/${projectId}` && document.querySelector('#app .content') === host) { const panel = document.createElement('section'); panel.className = 'panel milestones-panel'; panel.dataset.userMilestonesPanel = 'true'; panel.innerHTML = `<h2>Milestones</h2><p class="empty">${esc(error.message)}</p>`; host.append(panel); mountedKey = key; } } finally { mounting = false; }
  }
  new MutationObserver(() => queueMicrotask(mount)).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', () => { mountedKey = ''; queueMicrotask(mount); }); queueMicrotask(mount);
})();
