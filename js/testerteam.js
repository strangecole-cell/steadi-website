/* ============================================
   STEADI — Tester Reimbursement Form
   ============================================ */

(function () {
  'use strict';

  // The anon key is Supabase's public, browser-safe key (not the service
  // role key) — it identifies the project to the Edge Functions gateway.
  // It is safe to commit; access to actual data still requires going
  // through the server-side function, which uses its own service-role
  // credentials that never reach the browser.
  var SUPABASE_URL = 'https://oojzxtjmxqutnsobndso.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vanp4dGpteHF1dG5zb2JuZHNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2NzQ2OTIsImV4cCI6MjA5OTI1MDY5Mn0.bTc9fV5PBrxCy1SJK10kfInDtYLHYxestjVKEGavo1Q';
  var FUNCTION_URL = SUPABASE_URL + '/functions/v1/submit-reimbursement';

  var GENERIC_ERROR = 'We could not verify this submission. Please check your information and try again.';
  var SUCCESS_MESSAGE = 'Your reimbursement request has been received. Once approved, your $45 reward will be sent to your email through Tremendous.';
  var NETWORK_ERROR = 'Something went wrong on our end. Please try again in a moment.';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    var form = document.getElementById('tester-form');
    if (!form) return;

    form.addEventListener('submit', handleSubmit);
  }

  function handleSubmit(e) {
    e.preventDefault();

    var form = e.target;
    var messageEl = document.getElementById('form-message');
    var submitBtn = form.querySelector('.tester-form__submit');
    var submitLabel = form.querySelector('.tester-form__submit-label');

    var fullName = form.full_name.value.trim();
    var email = form.email.value.trim();
    var orderNumber = form.amazon_order_number.value.trim();
    var testerCode = form.tester_code.value.trim();

    if (!fullName || !email || !orderNumber || !testerCode) {
      showMessage(messageEl, GENERIC_ERROR, 'error');
      return;
    }

    setLoading(submitBtn, submitLabel, true);
    showMessage(messageEl, '', null);

    fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        full_name: fullName,
        email: email,
        amazon_order_number: orderNumber,
        tester_code: testerCode,
      }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        setLoading(submitBtn, submitLabel, false);

        if (result.ok && result.data && result.data.success) {
          showMessage(messageEl, SUCCESS_MESSAGE, 'success');
          form.reset();
          disableForm(form);
        } else {
          showMessage(messageEl, GENERIC_ERROR, 'error');
        }
      })
      .catch(function () {
        setLoading(submitBtn, submitLabel, false);
        showMessage(messageEl, NETWORK_ERROR, 'error');
      });
  }

  function setLoading(button, label, isLoading) {
    button.disabled = isLoading;
    label.textContent = isLoading ? 'Submitting…' : 'Submit';
  }

  function disableForm(form) {
    var fields = form.querySelectorAll('input, button');
    fields.forEach(function (field) {
      field.disabled = true;
    });
  }

  function showMessage(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove('is-success', 'is-error');
    if (type === 'success') el.classList.add('is-success');
    if (type === 'error') el.classList.add('is-error');
  }

})();
