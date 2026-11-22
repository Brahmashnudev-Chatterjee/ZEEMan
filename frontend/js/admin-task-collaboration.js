/* Admin task collaboration panel. Loaded before the console; invoked by its task-detail route. */
(() => {
  const statuses = ['pending', 'in_progress', 'on_hold', 'completed'];
  const allowedTypes = new Set(['application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip']);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const label = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const date = value => value ? new Date(value).toLocaleString() : 'Not set';
  const bytes = value => value < 1024 ? `${value} B` : value < 1048576 ? `${Math.round(value / 1024)} KB` : `${(value / 1048576).toFixed(1)} MB`;
  const selectOptions = (selected = '') => statuses.map(status => `<option value="${status}" ${status === selected ? 'selected' : ''}>${label(status)}</option>`).join('');
  const empty = text => `<p class="collab-empty">${esc(text)}</p>`;

  const json = async (api, path, method, body) => api(path, { method, body: JSON.stringify(body) });
  const fileMime = file => file.type || ({ txt: 'text/plain', csv: 'text/csv', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', zip: 'application/zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }[file.name.split('.').pop().toLowerCase()] || '');
  const fileBase64 = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('Could not read the selected file.')); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(file); });

  function commentMarkup(comment) {
    const replies = (comment.replies || []).map(reply => `<article class="comment reply"><header><strong>${esc(reply.user_name)}</strong><small>${date(reply.created_at)}</small></header><p>${esc(reply.body)}</p><footer><button class="text-btn" data-comment-edit="${reply.id}">Edit</button><button class="text-btn danger-text" data-comment-delete="${reply.id}">Delete</button></footer></article>`).join('');
    return `<article class="comment"><header><strong>${esc(comment.user_name)}</strong><small>${date(comment.created_at)}${comment.updated_at ? ' · edited' : ''}</small></header><p>${esc(comment.body)}</p><footer><button class="text-btn" data-comment-reply="${comment.id}">Reply</button><button class="text-btn" data-comment-edit="${comment.id}">Edit</button><button class="text-btn danger-text" data-comment-delete="${comment.id}">Delete</button></footer><div class="reply-host" data-reply-host="${comment.id}"></div>${replies}</article>`;
  }

  window.ZeeManAdminTaskDetail = async taskId => {
    const admin = window.ZeeManAdmin;
    if (!admin) return;
    const { api, shell, toast, go, taskForm } = admin;
    const [taskResult, commentsResult, mentionResult, attachmentsResult, subtasksResult, checklistResult, activityResult] = await Promise.all([
      api(`/tasks/${taskId}`), api(`/tasks/${taskId}/comments`), api(`/tasks/${taskId}/mentionable-users`), api(`/tasks/${taskId}/attachments`), api(`/tasks/${taskId}/subtasks`), api(`/tasks/${taskId}/checklists`), api(`/tasks/${taskId}/activity`)
    ]);
    const task = taskResult.task;
    const comments = commentsResult.comments || [];
    const members = mentionResult.users || [];
    const attachments = attachmentsResult.attachments || [];
    const subtasks = subtasksResult.subtasks || [];
    const checklist = checklistResult.items || [];
    const activity = activityResult.activity || [];
    const memberOptions = members.map(member => `<option value="${member.id}">${esc(member.name)} — ${esc(member.email)}</option>`).join('');
    const completed = checklist.filter(item => item.completed_at).length;

    shell(`Task: ${task.title}`, `
      <section class="panel task-overview">
        <div class="section-title"><div><p class="eyebrow">Task overview</p><h2>${esc(task.title)}</h2><p>${esc(task.description || 'No task description.')}</p></div><div><button class="btn secondary" id="back-to-tasks">All tasks</button> <button class="btn primary" id="edit-parent-task">Edit task</button></div></div>
        <div class="collab-overview-grid"><div><small>Project</small><strong>${esc(task.project_name || 'Project')}</strong></div><div><small>Assignee</small><strong>${esc(task.user_name || 'Unassigned')}</strong></div><div><small>Priority</small><span class="priority ${esc(task.priority)}">${label(task.priority)}</span></div><div><small>Status</small><span class="pill ${esc(task.status)}">${label(task.status)}</span></div><div><small>Start</small><strong>${date(task.start_date)}</strong></div><div><small>Due</small><strong>${date(task.due_date)}</strong></div></div>
      </section>
      <div class="collab-layout">
        <section class="panel collab-section" aria-labelledby="comments-heading"><div class="section-title"><div><p class="eyebrow">Discussion</p><h2 id="comments-heading">Comments</h2></div><span class="count-chip">${comments.length}</span></div>
          <form id="comment-form" class="stack"><label>Comment<textarea name="body" maxlength="4000" required placeholder="Add instructions, an update, or a question…"></textarea></label><label>Find project member <input id="mention-search" type="search" placeholder="Search members to mention" autocomplete="off"></label><label>Mention project members <select name="mention_ids" multiple size="${Math.min(Math.max(members.length, 2), 6)}" aria-describedby="mention-help">${memberOptions}</select><small id="mention-help">Select members to insert an @mention and notify them.</small></label><div><button class="btn primary">Post comment</button></div></form>
          <div class="comment-list">${comments.length ? comments.map(commentMarkup).join('') : empty('No comments yet. Start the task discussion here.')}</div>
        </section>
        <section class="panel collab-section" aria-labelledby="attachments-heading"><div class="section-title"><div><p class="eyebrow">Private files</p><h2 id="attachments-heading">Attachments</h2></div><span class="count-chip">${attachments.length}</span></div>
          <form id="attachment-form" class="attachment-upload"><label for="attachment-file">Upload file <small>PDF, PNG, JPEG, TXT, CSV, DOCX, XLSX or ZIP · maximum 5 MB</small></label><input id="attachment-file" name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx,.zip" required><button class="btn secondary">Upload attachment</button></form>
          <div class="attachment-list">${attachments.length ? attachments.map(file => `<article class="attachment">${file.mime_type.startsWith('image/') ? `<img class="attachment-preview" src="/api/attachments/${file.id}/download" alt="Preview of ${esc(file.original_name)}">` : ''}<div><strong>${esc(file.original_name)}</strong><small>${esc(file.mime_type)} · ${bytes(Number(file.size_bytes))} · uploaded by ${esc(file.user_name)} on ${date(file.created_at)}</small></div><div><a class="text-btn" href="/api/attachments/${file.id}/download">Download</a><button class="text-btn danger-text" data-attachment-delete="${file.id}">Delete</button></div></article>`).join('') : empty('No attachments have been uploaded.')}</div>
        </section>
        <section class="panel collab-section" aria-labelledby="subtasks-heading"><div class="section-title"><div><p class="eyebrow">Work breakdown</p><h2 id="subtasks-heading">Subtasks</h2></div><span class="count-chip">${subtasks.length}</span></div>
          <form id="subtask-form" class="form-grid compact-form"><label class="full">Subtask title<input name="title" maxlength="255" required></label><label class="full">Description<textarea name="description" maxlength="4000"></textarea></label><label>Assigned member<select name="user_id" required>${memberOptions}</select></label><label>Status<select name="status">${selectOptions('pending')}</select></label><div class="full"><button class="btn primary">Create subtask</button></div></form>
          <div class="subtask-list">${subtasks.length ? subtasks.map(subtask => `<article class="subtask"><div><strong>${esc(subtask.title)}</strong><p>${esc(subtask.description || 'No description')}</p><small>Assigned to ${esc(subtask.user_name || 'Unassigned')}</small></div><div class="subtask-actions"><label class="sr-only" for="subtask-status-${subtask.id}">Status for ${esc(subtask.title)}</label><select id="subtask-status-${subtask.id}" data-subtask-status="${subtask.id}">${selectOptions(subtask.status)}</select><button class="text-btn danger-text" data-subtask-delete="${subtask.id}">Delete</button></div></article>`).join('') : empty('No subtasks have been created.')}</div>
        </section>
        <section class="panel collab-section" aria-labelledby="checklist-heading"><div class="section-title"><div><p class="eyebrow">Completion checklist</p><h2 id="checklist-heading">Checklists</h2></div><span class="count-chip">${completed}/${checklist.length}</span></div>
          <form id="checklist-form" class="inline-form"><label>New checklist item<input name="title" maxlength="255" required></label><label>Optional owner<select name="user_id"><option value="">No owner</option>${memberOptions}</select></label><button class="btn primary">Add item</button></form>
          <div class="checklist-list">${checklist.length ? checklist.map(item => `<label class="checklist-item"><input type="checkbox" data-checklist-complete="${item.id}" ${item.completed_at ? 'checked' : ''}><span><strong>${esc(item.title)}</strong><small>${item.user_name ? `Owner: ${esc(item.user_name)}` : 'No owner'}${item.completed_at ? ` · completed ${date(item.completed_at)}` : ''}</small></span></label>`).join('') : empty('No checklist items have been created.')}</div>
        </section>
        <section class="panel collab-section collab-activity" aria-labelledby="activity-heading"><div class="section-title"><div><p class="eyebrow">Audit trail</p><h2 id="activity-heading">Activity timeline</h2></div></div><div class="timeline">${activity.length ? activity.map(event => `<article><span aria-hidden="true">●</span><div><strong>${esc(event.user_name || 'System')}</strong><p>${esc(event.description || label(event.action))}</p><small>${date(event.created_at)}</small></div></article>`).join('') : empty('No collaboration activity has been recorded yet.')}</div></section>
      </div>`);

    document.querySelector('#back-to-tasks').onclick = () => go('/admin/tasks');
    document.querySelector('#edit-parent-task').onclick = () => taskForm(task);
    const refresh = async success => { if (success) toast(success); await window.ZeeManAdminTaskDetail(taskId); };
    const handle = async (operation, success) => { try { await operation(); await refresh(success); } catch (error) { toast(error.message, 'error'); } };

    const commentForm = document.querySelector('#comment-form');
    const mentionSearch = document.querySelector('#mention-search');
    mentionSearch.oninput = () => { const term = mentionSearch.value.trim().toLowerCase(); [...commentForm.mention_ids.options].forEach(option => { option.hidden = !!term && !option.textContent.toLowerCase().includes(term); }); };
    commentForm.mention_ids.onchange = () => { [...commentForm.mention_ids.selectedOptions].forEach(option => { const name = option.textContent.split(' — ')[0]; if (!commentForm.body.value.includes(`@${name}`)) commentForm.body.value = `${commentForm.body.value}${commentForm.body.value ? ' ' : ''}@${name}`; }); };
    commentForm.onsubmit = event => { event.preventDefault(); const form = event.currentTarget; handle(() => json(api, `/tasks/${taskId}/comments`, 'POST', { body: form.body.value, mention_ids: [...form.mention_ids.selectedOptions].map(option => Number(option.value)) }), 'Comment posted.'); };
    document.querySelectorAll('[data-comment-reply]').forEach(button => { button.onclick = () => { const host = document.querySelector(`[data-reply-host="${button.dataset.commentReply}"]`); host.innerHTML = `<form class="reply-form"><label>Reply<textarea required maxlength="4000" aria-label="Reply text"></textarea></label><button class="btn secondary">Post reply</button> <button type="button" class="text-btn cancel-reply">Cancel</button></form>`; const form = host.querySelector('form'); form.onsubmit = event => { event.preventDefault(); handle(() => json(api, `/tasks/${taskId}/comments`, 'POST', { body: form.querySelector('textarea').value, parent_id: Number(button.dataset.commentReply) }), 'Reply posted.'); }; host.querySelector('.cancel-reply').onclick = () => { host.innerHTML = ''; }; form.querySelector('textarea').focus(); }; });
    document.querySelectorAll('[data-comment-edit]').forEach(button => { button.onclick = () => { const article = button.closest('.comment'); const paragraph = article.querySelector('p'); const previous = paragraph.textContent; paragraph.outerHTML = `<form class="comment-edit-form"><label class="sr-only">Edit comment</label><textarea required maxlength="4000">${esc(previous)}</textarea><button class="btn secondary">Save</button> <button type="button" class="text-btn cancel-edit">Cancel</button></form>`; const form = article.querySelector('.comment-edit-form'); form.onsubmit = event => { event.preventDefault(); handle(() => json(api, `/comments/${button.dataset.commentEdit}`, 'PATCH', { body: form.querySelector('textarea').value }), 'Comment updated.'); }; form.querySelector('.cancel-edit').onclick = () => { form.outerHTML = `<p>${esc(previous)}</p>`; }; form.querySelector('textarea').focus(); }; });
    document.querySelectorAll('[data-comment-delete]').forEach(button => { button.onclick = () => { if (confirm('Delete this comment?')) handle(() => api(`/comments/${button.dataset.commentDelete}`, { method: 'DELETE' }), 'Comment deleted.'); }; });
    document.querySelector('#attachment-form').onsubmit = async event => { event.preventDefault(); const form = event.currentTarget; const file = form.file.files[0]; if (!file) return; const mimeType = fileMime(file); if (file.size > 5 * 1024 * 1024) return toast('Files must be 5 MB or smaller.', 'error'); if (!allowedTypes.has(mimeType)) return toast('That file type is not allowed.', 'error'); form.querySelector('button').disabled = true; try { const content_base64 = await fileBase64(file); await json(api, `/tasks/${taskId}/attachments`, 'POST', { file: { name: file.name, mime_type: mimeType, content_base64 } }); await refresh('Attachment uploaded.'); } catch (error) { toast(error.message, 'error'); form.querySelector('button').disabled = false; } };
    document.querySelectorAll('[data-attachment-delete]').forEach(button => { button.onclick = () => { if (confirm('Delete this attachment?')) handle(() => api(`/attachments/${button.dataset.attachmentDelete}`, { method: 'DELETE' }), 'Attachment deleted.'); }; });
    document.querySelector('#subtask-form').onsubmit = event => { event.preventDefault(); const form = event.currentTarget; handle(() => json(api, `/tasks/${taskId}/subtasks`, 'POST', { title: form.title.value, description: form.description.value, user_id: Number(form.user_id.value), status: form.status.value }), 'Subtask created.'); };
    document.querySelectorAll('[data-subtask-status]').forEach(select => { select.onchange = () => handle(() => json(api, `/subtasks/${select.dataset.subtaskStatus}/status`, 'PATCH', { status: select.value }), 'Subtask status updated.'); });
    document.querySelectorAll('[data-subtask-delete]').forEach(button => { button.onclick = () => { if (confirm('Delete this subtask?')) handle(() => api(`/subtasks/${button.dataset.subtaskDelete}`, { method: 'DELETE' }), 'Subtask deleted.'); }; });
    document.querySelector('#checklist-form').onsubmit = event => { event.preventDefault(); const form = event.currentTarget; handle(() => json(api, `/tasks/${taskId}/checklists`, 'POST', { title: form.title.value, user_id: form.user_id.value ? Number(form.user_id.value) : null }), 'Checklist item added.'); };
    document.querySelectorAll('[data-checklist-complete]').forEach(input => { input.onchange = () => handle(() => json(api, `/checklist-items/${input.dataset.checklistComplete}/completion`, 'PATCH', { completed: input.checked }), 'Checklist updated.'); });
  };

  const addDetailActions = () => {
    const admin = window.ZeeManAdmin;
    if (!admin) return;
    document.querySelectorAll('[data-edit-task]').forEach(edit => {
      if (edit.parentElement.querySelector('[data-collaboration-task]')) return;
      const view = document.createElement('button');
      view.className = 'text-btn'; view.type = 'button'; view.dataset.collaborationTask = edit.dataset.editTask; view.textContent = 'Collaboration';
      view.onclick = () => admin.go(`/admin/tasks/${view.dataset.collaborationTask}`);
      edit.parentElement.insertBefore(view, edit);
    });
  };
  new MutationObserver(addDetailActions).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', addDetailActions);
})();
