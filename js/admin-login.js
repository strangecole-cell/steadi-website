/* ============================================
   STEADI — Admin Login
   ============================================ */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    redirectIfAlreadyLoggedIn();

    var form = document.getElementById('admin-login-form');
    if (!form) return;
    form.addEventListener('submit', handleSubmit);
  }

  function redirectIfAlreadyLoggedIn() {
    window.steadiAdmin.supabaseClient.auth.getSession().then(function (result) {
      if (result.data && result.data.session) {
        window.location.href = 'tester-reimbursements/';
      }
    });
  }

  function handleSubmit(e) {
    e.preventDefault();

    var form = e.target;
    var messageEl = document.getElementById('login-message');
    var submitBtn = form.querySelector('button[type="submit"]');

    var email = form.email.value.trim();
    var password = form.password.value;

    submitBtn.disabled = true;
    showMessage(messageEl, '', null);

    window.steadiAdmin.supabaseClient.auth
      .signInWithPassword({ email: email, password: password })
      .then(function (result) {
        submitBtn.disabled = false;

        if (result.error) {
          showMessage(messageEl, 'Invalid email or password.', 'error');
          return;
        }

        window.location.href = 'tester-reimbursements/';
      })
      .catch(function () {
        submitBtn.disabled = false;
        showMessage(messageEl, 'Something went wrong. Please try again.', 'error');
      });
  }

  function showMessage(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove('is-success', 'is-error');
    if (type === 'error') el.classList.add('is-error');
  }
})();
