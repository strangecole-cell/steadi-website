/* ============================================
   STEADI — Admin: Tester Reimbursements Dashboard
   ============================================ */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    window.steadiAdmin.supabaseClient.auth.getSession().then(function (result) {
      var session = result.data && result.data.session;
      if (!session) {
        window.location.href = '../';
        return;
      }
      loadRequests(session.access_token);
    });

    var signOutBtn = document.getElementById('sign-out');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', function () {
        window.steadiAdmin.supabaseClient.auth.signOut().then(function () {
          window.location.href = '../';
        });
      });
    }
  }

  function loadRequests(accessToken) {
    var listEl = document.getElementById('admin-list');
    listEl.innerHTML = '<p class="admin-loading">Loading…</p>';

    fetch(window.steadiAdmin.FUNCTIONS_URL + '/admin-list-requests', {
      headers: { Authorization: 'Bearer ' + accessToken },
    })
      .then(function (res) {
        if (res.status === 401) {
          window.location.href = '../';
          return null;
        }
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result) return;
        if (!result.ok) {
          listEl.innerHTML = '<p class="admin-error">Failed to load requests. Please refresh.</p>';
          return;
        }
        renderModeBanner(result.data.tremendousMode);
        render(result.data.requests || [], accessToken);
      })
      .catch(function () {
        listEl.innerHTML = '<p class="admin-error">Failed to load requests. Please refresh.</p>';
      });
  }

  function renderModeBanner(mode) {
    var el = document.getElementById('mode-banner');
    if (!el) return;

    if (mode === 'production') {
      el.innerHTML = '<div class="mode-banner mode-banner--production">⚠ PRODUCTION MODE — approvals send real Tremendous rewards</div>';
    } else {
      el.innerHTML = '<div class="mode-banner mode-banner--sandbox">🧪 SANDBOX MODE — no real rewards are sent</div>';
    }
  }

  function render(requests, accessToken) {
    var listEl = document.getElementById('admin-list');
    listEl.innerHTML = '';

    var needsReview = requests.filter(function (r) { return !r.reviewed_at; });
    var reviewed = requests.filter(function (r) { return !!r.reviewed_at; });

    listEl.appendChild(renderSection('Needs Review (' + needsReview.length + ')', needsReview, accessToken, true));
    listEl.appendChild(renderSection('Reviewed', reviewed, accessToken, false));
  }

  function renderSection(title, requests, accessToken, showApproveReject) {
    var section = document.createElement('section');
    section.className = 'admin-section';

    var heading = document.createElement('h2');
    heading.textContent = title;
    section.appendChild(heading);

    if (requests.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'admin-empty';
      empty.textContent = 'Nothing here.';
      section.appendChild(empty);
      return section;
    }

    var table = document.createElement('table');
    table.className = 'admin-table';

    var thead = document.createElement('thead');
    thead.innerHTML =
      '<tr><th>Tester</th><th>Email</th><th>Order #</th><th>Submitted</th><th>Status</th>' +
      '<th>Tremendous</th><th>Actions</th></tr>';
    table.appendChild(thead);

    var tbody = document.createElement('tbody');

    requests.forEach(function (r) {
      var tr = document.createElement('tr');
      var testerName = (r.approved_testers && r.approved_testers.full_name) || r.submitted_name;

      tr.appendChild(cell(testerName));
      tr.appendChild(cell(r.submitted_email));
      tr.appendChild(cell(r.amazon_order_number));
      tr.appendChild(cell(formatDate(r.submitted_at)));
      tr.appendChild(cell(statusLabel(r)));
      tr.appendChild(cell(tremendousLabel(r)));
      tr.appendChild(actionsCell(r, accessToken, showApproveReject));

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    section.appendChild(table);
    return section;
  }

  function actionsCell(request, accessToken, showApproveReject) {
    var td = document.createElement('td');
    td.className = 'admin-actions';

    if (showApproveReject) {
      var approveBtn = makeButton('Approve', 'btn-admin--approve');
      var rejectBtn = makeButton('Reject', 'btn-admin--reject');

      approveBtn.addEventListener('click', function () {
        review(request.id, 'approve', accessToken, [approveBtn, rejectBtn]);
      });
      rejectBtn.addEventListener('click', function () {
        review(request.id, 'reject', accessToken, [approveBtn, rejectBtn]);
      });

      td.appendChild(approveBtn);
      td.appendChild(rejectBtn);
      return td;
    }

    if (request.status === 'failed') {
      var retryBtn = makeButton('Retry Payout', 'btn-admin--approve');
      retryBtn.addEventListener('click', function () {
        review(request.id, 'retry', accessToken, [retryBtn]);
      });
      td.appendChild(retryBtn);
      return td;
    }

    td.textContent = '—';
    return td;
  }

  function makeButton(label, className) {
    var btn = document.createElement('button');
    btn.className = 'btn-admin ' + className;
    btn.textContent = label;
    return btn;
  }

  function review(requestId, action, accessToken, buttonsToDisable) {
    buttonsToDisable.forEach(function (b) { b.disabled = true; });

    fetch(window.steadiAdmin.FUNCTIONS_URL + '/admin-review-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + accessToken,
      },
      body: JSON.stringify({ request_id: requestId, action: action }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          alert((result.data && result.data.error) || 'Failed to update request.');
          buttonsToDisable.forEach(function (b) { b.disabled = false; });
          return;
        }
        loadRequests(accessToken);
      })
      .catch(function () {
        alert('Failed to update request. Please try again.');
        buttonsToDisable.forEach(function (b) { b.disabled = false; });
      });
  }

  function cell(text) {
    var td = document.createElement('td');
    td.textContent = text == null ? '' : String(text);
    return td;
  }

  function statusLabel(r) {
    if (r.rejected_at) return 'Rejected';
    if (r.status === 'paid') return 'Approved — Paid';
    if (r.status === 'processing') return 'Approved — sending payout…';
    if (r.status === 'failed') return 'Approved — payout failed';
    if (r.approved_at) return 'Approved — awaiting payout';
    return 'Pending review';
  }

  function tremendousLabel(r) {
    if (r.status === 'paid') return r.tremendous_order_id ? 'Order ' + r.tremendous_order_id : 'Paid';
    if (r.status === 'failed') return r.failure_message || 'Failed';
    if (r.status === 'processing') return 'In progress';
    return '—';
  }

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }
})();
