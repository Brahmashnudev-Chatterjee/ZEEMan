(() => {
  const API = '/api';
  const content = document.querySelector('#auth-content');
  const toastRoot = document.querySelector('#toast-root');
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const routeFor = (user) => user.role === 'admin' ? '/admin/dashboard' : (user.onboarding_completed_at ? '/user/dashboard' : '/onboarding');
  const api = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Something went wrong.');
    return data;
  };
  const toast = (message, tone = 'success') => { const item = document.createElement('div'); item.className = `toast ${tone}`; item.textContent = message; toastRoot.append(item); setTimeout(() => item.remove(), 4200); };
  const setBusy = (button, busy, label) => { button.disabled = busy; button.dataset.defaultLabel ||= button.textContent; button.textContent = busy ? label : button.dataset.defaultLabel; };
  const localLink = (url, label) => url ? `<a class="text-link" href="${esc(url)}">${label}</a>` : '';
  const signedInUser = async () => { try { return (await api('/auth/me')).user; } catch (_) { return null; } };
  const datesValid = (start, due) => !start || !due || new Date(start) <= new Date(due);

  function authPage(register) {
    content.innerHTML = `<div class="auth-heading"><p class="eyebrow">${register ? 'GET STARTED' : 'WELCOME BACK'}</p><h2>${register ? 'Create your workspace' : 'Sign in to ZeeMan'}</h2><p>${register ? 'Your free account is ready for a more intentional day.' : 'Use your account to pick up where you left off.'}</p></div><form id="auth-form" class="stack">${register ? '<label>Full name<input name="name" autocomplete="name" required minlength="2" maxlength="120" placeholder="Alex Morgan"></label>' : ''}<label>Email address<input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label><label>Password<input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" required minlength="12" placeholder="12+ characters, upper/lowercase and number"></label><button class="btn primary wide" type="submit" data-testid="auth-submit">${register ? 'Create account' : 'Sign in'}</button><p id="auth-status" class="form-status" role="status"></p></form><p class="auth-switch">${register ? 'Already have an account?' : 'New to ZeeMan?'} <a href="${register ? '/login' : '/register'}">${register ? 'Sign in' : 'Create an account'}</a></p>${register ? '' : '<p class="auth-switch"><a href="/forgot-password">Forgot password?</a></p>'}<p class="demo-note">Administrator access is securely created from environment configuration.</p>`;
    document.querySelector('#auth-form').onsubmit = async (event) => {
      event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button'); const status = form.querySelector('#auth-status');
      setBusy(button, true, register ? 'Creating…' : 'Signing in…'); status.textContent = '';
      try { const result = await api(register ? '/auth/register' : '/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); location.replace(routeFor(result.user)); }
      catch (error) { status.textContent = error.message; setBusy(button, false); }
    };
  }

  function recoveryPage(reset) {
    const token = new URLSearchParams(location.search).get('token') || '';
    content.innerHTML = `<div class="auth-heading"><p class="eyebrow">${reset ? 'RESET PASSWORD' : 'ACCOUNT RECOVERY'}</p><h2>${reset ? 'Choose a new password' : 'Forgot your password?'}</h2><p>${reset ? 'Use a strong, new password to secure your account.' : 'Enter your email. The response will not reveal whether an account exists.'}</p></div><form id="recovery-form" class="stack">${reset ? '<label>New password<input name="password" type="password" autocomplete="new-password" required minlength="12"></label><label>Confirm password<input name="password_confirmation" type="password" autocomplete="new-password" required minlength="12"></label>' : '<label>Email address<input name="email" type="email" autocomplete="email" required></label>'}<button class="btn primary wide" type="submit">${reset ? 'Reset password' : 'Request reset link'}</button><p id="recovery-status" class="form-status" role="status"></p></form><p class="auth-switch"><a href="/login">Return to sign in</a></p>`;
    document.querySelector('#recovery-form').onsubmit = async (event) => {
      event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); const button = form.querySelector('button'); const status = form.querySelector('#recovery-status');
      if (reset && values.password !== values.password_confirmation) { status.textContent = 'Passwords must match.'; return; }
      setBusy(button, true, reset ? 'Resetting…' : 'Sending…'); status.textContent = '';
      try { const result = await api(reset ? '/auth/reset-password' : '/auth/forgot-password', { method: 'POST', body: JSON.stringify({ ...values, ...(reset ? { token } : {}) }) }); if (reset) { status.textContent = 'Password reset. Redirecting to sign in…'; setTimeout(() => { location.href = '/login'; }, 850); return; } status.innerHTML = `${esc(result.message)} ${result.development_notice ? '<strong>Development mode:</strong> check the local server console. ' : ''}${localLink(result.development_url, 'Open local reset link')}`; }
      catch (error) { status.textContent = error.message; }
      finally { if (!reset) setBusy(button, false); }
    };
  }

  async function verificationPage() {
    const token = new URLSearchParams(location.search).get('token') || ''; const user = await signedInUser();
    content.innerHTML = `<div class="auth-heading"><p class="eyebrow">EMAIL VERIFICATION</p><h2>Verify your email</h2><p id="verify-status" class="form-status" role="status">${token ? 'Checking your secure verification link…' : 'Open the verification link from your email to confirm your account.'}</p></div><div id="verify-actions" class="stack"></div><p class="auth-switch"><a href="/login">Return to sign in</a></p>`;
    const status = document.querySelector('#verify-status'); const actions = document.querySelector('#verify-actions');
    const addResend = () => {
      if (!user || user.email_verified_at) return;
      actions.innerHTML = '<button class="btn secondary wide" id="resend-verification" type="button">Resend verification email</button><p id="resend-status" class="form-status" role="status"></p>';
      const button = document.querySelector('#resend-verification'); const resendStatus = document.querySelector('#resend-status');
      button.onclick = async () => {
        setBusy(button, true, 'Sending…'); resendStatus.textContent = '';
        try { const result = await api('/auth/resend-verification', { method: 'POST' }); resendStatus.innerHTML = `${esc(result.message)} ${result.development_notice ? '<strong>Development mode:</strong> this was written to the local server console. ' : ''}${localLink(result.development_url, 'Open local verification link')}`; let seconds = 60; const timer = setInterval(() => { button.textContent = `Resend available in ${seconds--}s`; if (seconds < 0) { clearInterval(timer); setBusy(button, false); } }, 1000); }
        catch (error) { resendStatus.textContent = error.message || 'We could not send verification instructions.'; setBusy(button, false); }
      };
    };
    if (!token) { if (user?.email_verified_at) status.textContent = 'Your email is already verified.'; addResend(); return; }
    try { await api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }); status.textContent = user ? 'Your email is verified. Continue to ZeeMan.' : 'Your email is verified. Sign in to continue.'; actions.innerHTML = `<a class="btn primary wide" href="${user ? routeFor(user) : '/login'}">${user ? 'Continue' : 'Sign in'}</a>`; }
    catch (error) { status.textContent = error.message || 'This verification link is invalid, expired, or already used.'; addResend(); }
  }

  async function onboardingPage() {
    let onboarding = (await api('/auth/onboarding')).onboarding; let step = Math.max(1, Math.min(5, Number(onboarding.onboarding_step) || 1));
    const reload = async () => { onboarding = (await api('/auth/onboarding')).onboarding; };
    const render = () => {
      const projectName = onboarding.onboarding_project_name || '';
      const page = {
        1: `<h2>Welcome to ZeeMan</h2><p>Bring projects, tasks, and progress into one focused workspace. You can finish this setup later.</p>`,
        2: `<h2>Complete your profile</h2><label>Full name<input id="on-name" required maxlength="120" value="${esc(onboarding.name || '')}"></label><label>Profile details <small>(optional)</small><textarea id="on-bio" maxlength="500">${esc(onboarding.bio || '')}</textarea></label><label>Avatar URL <small>(optional)</small><input id="on-avatar" type="url" value="${esc(onboarding.avatar_url || '')}" placeholder="https://example.com/avatar.png"></label>`,
        3: `<h2>Create your first project</h2><p class="demo-note">Optional — create a project now or add one later.</p><label>Project name<input id="on-project" maxlength="120" value="${esc(projectName)}"></label><label>Description <small>(optional)</small><textarea id="on-project-description" maxlength="1000">${esc(onboarding.onboarding_project_description || '')}</textarea></label><label>Start date <small>(optional)</small><input id="on-project-start" type="date" value="${esc((onboarding.onboarding_project_start_date || '').slice(0, 10))}"></label><label>Due date <small>(optional)</small><input id="on-project-due" type="date" value="${esc((onboarding.onboarding_project_due_date || '').slice(0, 10))}"></label>`,
        4: `<h2>Create your first task</h2><p class="demo-note">${projectName ? `This task will belong to <strong>${esc(projectName)}</strong>.` : 'Create a project first, or skip this optional step.'}</p><label>Task title<input id="on-task" maxlength="120" value="${esc(onboarding.onboarding_task_title || '')}"></label><label>Description <small>(optional)</small><textarea id="on-task-description" maxlength="1000">${esc(onboarding.onboarding_task_description || '')}</textarea></label><label>Priority<select id="on-priority">${['high', 'medium', 'low'].map((priority) => `<option value="${priority}" ${(onboarding.onboarding_task_priority || 'medium') === priority ? 'selected' : ''}>${priority[0].toUpperCase() + priority.slice(1)}</option>`).join('')}</select></label><label>Start date <small>(optional)</small><input id="on-task-start" type="date" value="${esc((onboarding.onboarding_task_start_date || '').slice(0, 10))}"></label><label>Due date <small>(optional)</small><input id="on-task-due" type="date" value="${esc((onboarding.onboarding_task_due_date || '').slice(0, 10))}"></label>`,
        5: `<h2>Your workspace is ready</h2><p>Welcome, ${esc(onboarding.name)}. ${projectName ? `Your project <strong>${esc(projectName)}</strong>` : 'Your workspace'} ${onboarding.onboarding_task_title ? `and task <strong>${esc(onboarding.onboarding_task_title)}</strong> are ready.` : 'is ready for your first task.'}</p>`
      }[step];
      content.innerHTML = `<div class="auth-heading onboarding-card"><p class="eyebrow">ONBOARDING · ${step}/5</p>${page}<p id="onboarding-status" class="form-status" role="status"></p></div><div class="onboarding-actions">${step > 1 && step < 5 ? '<button class="btn secondary" id="on-back" type="button">Back</button>' : '<span></span>'}${step === 3 || step === 4 ? '<button class="btn ghost" id="on-skip" type="button">Skip for now</button>' : ''}<button class="btn primary" id="on-next" type="button">${step === 5 ? 'Go to dashboard' : 'Save and continue'}</button></div>`;
      const status = document.querySelector('#onboarding-status'); const next = document.querySelector('#on-next');
      document.querySelector('#on-back')?.addEventListener('click', () => { step--; render(); });
      document.querySelector('#on-skip')?.addEventListener('click', async () => { try { await api(step === 3 ? '/auth/onboarding/project' : '/auth/onboarding/task', { method: 'POST', body: JSON.stringify({ skip: true }) }); await reload(); step++; render(); } catch (error) { status.textContent = error.message; } });
      next.onclick = async () => {
        status.textContent = '';
        try {
          if (step === 2) { const name = document.querySelector('#on-name').value.trim(); if (!name) throw new Error('Your name is required.'); setBusy(next, true, 'Saving…'); await api('/auth/onboarding/profile', { method: 'PUT', body: JSON.stringify({ name, bio: document.querySelector('#on-bio').value, avatar_url: document.querySelector('#on-avatar').value }) }); }
          if (step === 3) { const name = document.querySelector('#on-project').value.trim(); const start_date = document.querySelector('#on-project-start').value; const due_date = document.querySelector('#on-project-due').value; if (!name) throw new Error('Enter a project name or choose Skip for now.'); if (!datesValid(start_date, due_date)) throw new Error('Project start date must be on or before its due date.'); setBusy(next, true, 'Saving…'); await api('/auth/onboarding/project', { method: 'POST', body: JSON.stringify({ name, description: document.querySelector('#on-project-description').value, start_date, due_date }) }); }
          if (step === 4) { const title = document.querySelector('#on-task').value.trim(); const start_date = document.querySelector('#on-task-start').value; const due_date = document.querySelector('#on-task-due').value; if (!onboarding.onboarding_project_id) throw new Error('Create a project first, or choose Skip for now.'); if (!title) throw new Error('Enter a task title or choose Skip for now.'); if (!datesValid(start_date, due_date)) throw new Error('Task start date must be on or before its due date.'); setBusy(next, true, 'Saving…'); await api('/auth/onboarding/task', { method: 'POST', body: JSON.stringify({ title, description: document.querySelector('#on-task-description').value, priority: document.querySelector('#on-priority').value, start_date, due_date }) }); }
          if (step === 5) { setBusy(next, true, 'Finishing…'); await api('/auth/onboarding/complete', { method: 'POST' }); const user = await signedInUser(); location.href = routeFor(user); return; }
          await reload(); step++; render();
        } catch (error) { status.textContent = error.message || 'We could not save this step.'; setBusy(next, false); }
      };
    };
    render();
  }

  async function allocationOnboardingPage() {
    const onboarding = (await api('/auth/onboarding')).onboarding; let step = 1;
    const render = () => {
      const screens = {
        1: '<h2>Welcome to ZeeMan</h2><p>Your administrator will allocate projects and tasks to you. Once assigned, they will appear in My Projects and My Tasks.</p>',
        2: `<h2>Complete your profile</h2><label>Full name<input id="allocation-name" required maxlength="120" value="${esc(onboarding.name || '')}"></label><label>Profile details <small>(optional)</small><textarea id="allocation-bio" maxlength="500">${esc(onboarding.bio || '')}</textarea></label>`,
        3: '<h2>Ready for allocated work</h2><p>You are ready. Your administrator will assign projects and tasks to this workspace. Until then, your dashboard will show an empty state.</p>'
      };
      content.innerHTML = `<div class="auth-heading onboarding-card"><p class="eyebrow">WORKSPACE SETUP · ${step}/3</p>${screens[step]}<p id="onboarding-status" class="form-status" role="status"></p></div><div class="onboarding-actions">${step > 1 ? '<button class="btn secondary" id="on-back" type="button">Back</button>' : '<span></span>'}<button class="btn primary" id="on-next" type="button">${step === 3 ? 'Go to dashboard' : 'Continue'}</button></div>`;
      document.querySelector('#on-back')?.addEventListener('click', () => { step--; render(); });
      document.querySelector('#on-next').onclick = async (event) => { const button = event.currentTarget; const status = document.querySelector('#onboarding-status'); try { if (step === 2) { const name = document.querySelector('#allocation-name').value.trim(); if (!name) throw new Error('Your name is required.'); setBusy(button, true, 'Saving…'); await api('/auth/onboarding/profile', { method: 'PUT', body: JSON.stringify({ name, bio: document.querySelector('#allocation-bio').value, avatar_url: '' }) }); } if (step === 3) { setBusy(button, true, 'Finishing…'); await api('/auth/onboarding/complete', { method: 'POST' }); location.href = '/user/dashboard'; return; } step++; render(); } catch (error) { status.textContent = error.message; setBusy(button, false); } };
    };
    render();
  }

  async function init() {
    const route = location.pathname;
    if (route === '/onboarding') { const user = await signedInUser(); if (!user) { location.href = '/login'; return; } if (user.role === 'admin') { location.href = '/admin/dashboard'; return; } await allocationOnboardingPage(); return; }
    if (route === '/onboarding') { const user = await signedInUser(); if (!user) { location.href = '/login'; return; } await onboardingPage(); return; }
    if (route === '/verify-email') return verificationPage();
    if (route === '/forgot-password') return recoveryPage(false);
    if (route === '/reset-password') return recoveryPage(true);
    const user = await signedInUser(); if (user) { location.href = routeFor(user); return; }
    authPage(route === '/register');
  }
  init().catch((error) => { content.innerHTML = `<p class="form-status">${esc(error.message || 'We could not load this page.')}</p>`; });
})();
