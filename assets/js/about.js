(function () {
	'use strict';

	var form = document.getElementById('inquiry-form');
	if (!form) {
		return;
	}

	var status = document.getElementById('inquiry-status');
	var email = (form.getAttribute('data-email') || '').trim();

	function setStatus(message, isError) {
		if (!status) {
			return;
		}
		status.textContent = message || '';
		status.classList.toggle('is-error', Boolean(isError));
	}

	form.addEventListener('submit', function (event) {
		event.preventDefault();
		if (!email) {
			setStatus('Inquiries are not open yet.', true);
			return;
		}

		var visitor = String(form.visitor.value || '').trim();
		var replyTo = String(form.replyTo.value || '').trim();
		var topic = String(form.topic.value || 'Inquiry');
		var message = String(form.message.value || '').trim();

		if (!visitor || !message) {
			setStatus('Please include your name and a short note.', true);
			return;
		}

		var subject = topic + ' — f/stop inquiry from ' + visitor;
		var body = [
			message,
			'',
			'—',
			visitor + (replyTo ? ' · ' + replyTo : '')
		].join('\n');

		var url = 'mailto:' + encodeURIComponent(email)
			+ '?subject=' + encodeURIComponent(subject)
			+ '&body=' + encodeURIComponent(body);

		form.setAttribute('data-last-mailto', url);
		setStatus('Opening your email…');
		window.location.href = url;
	});
})();
