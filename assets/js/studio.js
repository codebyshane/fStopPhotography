(function () {
	'use strict';

	var form = document.getElementById('upload-form');
	var input = document.getElementById('photo-input');
	var dropzone = document.getElementById('dropzone');
	var preview = document.getElementById('upload-preview');
	var uploadStatus = document.getElementById('upload-status');
	var libraryStatus = document.getElementById('library-status');
	var list = document.getElementById('photo-list');
	var count = document.getElementById('library-count');

	if (!form || !list) {
		return;
	}

	function setStatus(node, message, isError) {
		node.textContent = message || '';
		node.style.color = isError ? '#e4a39a' : '#e2b67a';
	}

	function previewFile(file) {
		if (!file || !preview) {
			return;
		}
		var url = URL.createObjectURL(file);
		preview.src = url;
		preview.hidden = false;
	}

	async function fetchPhotos() {
		var response = await fetch('/api/studio/photos', { credentials: 'same-origin' });
		if (response.status === 401) {
			window.location.reload();
			return [];
		}
		var data = await response.json();
		return data.photos || [];
	}

	function render(photos) {
		count.textContent = photos.length === 1 ? '1 photograph' : photos.length + ' photographs';
		list.innerHTML = '';
		photos.forEach(function (photo, index) {
			var item = document.createElement('li');
			item.className = 'photo-card';
			item.dataset.id = photo.id;
			item.innerHTML =
				'<img src="' + photo.thumb + '" alt="" />' +
				'<div class="fields">' +
					'<input data-field="title" value="' + escapeAttr(photo.title) + '" aria-label="Title" />' +
					'<input data-field="location" value="' + escapeAttr(photo.location || '') + '" aria-label="Location" />' +
				'</div>' +
				'<div class="moves">' +
					'<button class="icon-btn" data-action="up" type="button"' + (index === 0 ? ' disabled' : '') + '>Up</button>' +
					'<button class="icon-btn" data-action="down" type="button"' + (index === photos.length - 1 ? ' disabled' : '') + '>Down</button>' +
					'<button class="icon-btn danger" data-action="delete" type="button">Remove</button>' +
				'</div>';
			list.appendChild(item);
		});
	}

	function escapeAttr(value) {
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/</g, '&lt;');
	}

	async function refresh() {
		try {
			var photos = await fetchPhotos();
			render(photos);
		} catch (error) {
			setStatus(libraryStatus, 'Could not load the gallery.', true);
		}
	}

	form.addEventListener('submit', async function (event) {
		event.preventDefault();
		if (!input.files || !input.files[0]) {
			setStatus(uploadStatus, 'Choose a photograph first.', true);
			return;
		}
		var data = new FormData(form);
		setStatus(uploadStatus, 'Processing photograph…');
		try {
			var response = await fetch('/api/studio/photos', {
				method: 'POST',
				body: data,
				credentials: 'same-origin'
			});
			var payload = await response.json();
			if (!response.ok) {
				throw new Error(payload.error || 'Upload failed.');
			}
			form.reset();
			preview.hidden = true;
			preview.removeAttribute('src');
			setStatus(uploadStatus, 'Added to the gallery.');
			await refresh();
		} catch (error) {
			setStatus(uploadStatus, error.message, true);
		}
	});

	input.addEventListener('change', function () {
		if (input.files && input.files[0]) {
			previewFile(input.files[0]);
		}
	});

	['dragenter', 'dragover'].forEach(function (type) {
		dropzone.addEventListener(type, function (event) {
			event.preventDefault();
			dropzone.classList.add('is-dragging');
		});
	});

	['dragleave', 'drop'].forEach(function (type) {
		dropzone.addEventListener(type, function (event) {
			event.preventDefault();
			dropzone.classList.remove('is-dragging');
		});
	});

	dropzone.addEventListener('drop', function (event) {
		var file = event.dataTransfer.files && event.dataTransfer.files[0];
		if (!file) {
			return;
		}
		var transfer = new DataTransfer();
		transfer.items.add(file);
		input.files = transfer.files;
		previewFile(file);
	});

	list.addEventListener('change', async function (event) {
		var field = event.target.getAttribute('data-field');
		var card = event.target.closest('.photo-card');
		if (!field || !card) {
			return;
		}
		try {
			var response = await fetch('/api/studio/photos/' + card.dataset.id, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ [field]: event.target.value })
			});
			if (!response.ok) {
				throw new Error('Could not save.');
			}
			setStatus(libraryStatus, 'Saved.');
		} catch (error) {
			setStatus(libraryStatus, error.message, true);
		}
	});

	list.addEventListener('click', async function (event) {
		var button = event.target.closest('button[data-action]');
		var card = event.target.closest('.photo-card');
		if (!button || !card) {
			return;
		}
		var action = button.getAttribute('data-action');
		var cards = Array.prototype.slice.call(list.querySelectorAll('.photo-card'));
		var ids = cards.map(function (node) { return node.dataset.id; });
		var index = ids.indexOf(card.dataset.id);

		if (action === 'delete') {
			if (!window.confirm('Remove this photograph from the gallery?')) {
				return;
			}
			try {
				var response = await fetch('/api/studio/photos/' + card.dataset.id, {
					method: 'DELETE',
					credentials: 'same-origin'
				});
				if (!response.ok) {
					throw new Error('Could not remove that photograph.');
				}
				await refresh();
				setStatus(libraryStatus, 'Removed.');
			} catch (error) {
				setStatus(libraryStatus, error.message, true);
			}
			return;
		}

		if (action === 'up' && index > 0) {
			ids.splice(index, 1);
			ids.splice(index - 1, 0, card.dataset.id);
		}
		if (action === 'down' && index < ids.length - 1) {
			ids.splice(index, 1);
			ids.splice(index + 1, 0, card.dataset.id);
		}
		try {
			await fetch('/api/studio/photos/reorder', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ ids: ids })
			});
			await refresh();
		} catch (error) {
			setStatus(libraryStatus, 'Could not reorder the gallery.', true);
		}
	});

	refresh();
})();
