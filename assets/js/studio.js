(function () {
	'use strict';

	var form = document.getElementById('upload-form');
	var seriesForm = document.getElementById('series-form');
	var input = document.getElementById('photo-input');
	var dropzone = document.getElementById('dropzone');
	var preview = document.getElementById('upload-preview');
	var uploadStatus = document.getElementById('upload-status');
	var seriesStatus = document.getElementById('series-status');
	var libraryStatus = document.getElementById('library-status');
	var list = document.getElementById('photo-list');
	var seriesList = document.getElementById('series-list');
	var seriesSelect = document.getElementById('series-select');
	var count = document.getElementById('library-count');
	var exhibition = { site: {}, series: [], photos: [] };

	if (!form || !list) {
		return;
	}

	function setStatus(node, message, isError) {
		if (!node) {
			return;
		}
		node.textContent = message || '';
		node.style.color = isError ? '#e4a39a' : '#e2b67a';
	}

	function escapeAttr(value) {
		return String(value || '')
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/</g, '&lt;');
	}

	function previewFile(file) {
		if (!file || !preview) {
			return;
		}
		preview.src = URL.createObjectURL(file);
		preview.hidden = false;
	}

	async function load() {
		var response = await fetch('/api/studio/exhibition', { credentials: 'same-origin' });
		if (response.status === 401) {
			window.location.reload();
			return;
		}
		exhibition = await response.json();
		render();
	}

	function renderSelect() {
		var current = seriesSelect.value;
		seriesSelect.innerHTML = '<option value="">Choose a series</option>';
		(exhibition.series || []).forEach(function (series) {
			var option = document.createElement('option');
			option.value = series.id;
			option.textContent = series.title;
			seriesSelect.appendChild(option);
		});
		if (current) {
			seriesSelect.value = current;
		}
	}

	function renderSeries() {
		seriesList.innerHTML = '';
		(exhibition.series || []).forEach(function (series, index) {
			var photos = (exhibition.photos || []).filter(function (photo) {
				return photo.seriesId === series.id;
			});
			var item = document.createElement('li');
			item.className = 'photo-card series-card';
			item.dataset.id = series.id;
			item.innerHTML =
				'<div class="fields">' +
					'<input data-series-field="title" value="' + escapeAttr(series.title) + '" aria-label="Series title" />' +
					'<input data-series-field="kicker" value="' + escapeAttr(series.kicker) + '" aria-label="Kicker" />' +
					'<input data-series-field="description" value="' + escapeAttr(series.description) + '" aria-label="Description" />' +
					'<p class="quiet">' + (photos.length === 1 ? '1 photograph' : photos.length + ' photographs') + '</p>' +
				'</div>' +
				'<div class="moves">' +
					'<button class="icon-btn" data-series-action="up" type="button"' + (index === 0 ? ' disabled' : '') + '>Up</button>' +
					'<button class="icon-btn" data-series-action="down" type="button"' + (index === exhibition.series.length - 1 ? ' disabled' : '') + '>Down</button>' +
					'<button class="icon-btn danger" data-series-action="delete" type="button">Remove</button>' +
				'</div>';
			seriesList.appendChild(item);
		});
	}

	function renderPhotos() {
		var photos = exhibition.photos || [];
		count.textContent = photos.length === 1 ? '1 photograph' : photos.length + ' photographs';
		list.innerHTML = '';
		(exhibition.series || []).forEach(function (series) {
			var group = photos.filter(function (photo) { return photo.seriesId === series.id; });
			if (!group.length) {
				return;
			}
			var heading = document.createElement('h3');
			heading.className = 'group-title';
			heading.textContent = series.title;
			list.appendChild(heading);
			var ol = document.createElement('ol');
			ol.className = 'photo-list';
			group.forEach(function (photo, index) {
				var featured = exhibition.site.featuredPhotoId === photo.id;
				var item = document.createElement('li');
				item.className = 'photo-card';
				item.dataset.id = photo.id;
				item.innerHTML =
					'<img src="' + photo.thumb + '" alt="" />' +
					'<div class="fields">' +
						'<input data-field="title" value="' + escapeAttr(photo.title) + '" aria-label="Title" />' +
						'<input data-field="location" value="' + escapeAttr(photo.location) + '" aria-label="Location" />' +
						'<select data-field="seriesId" aria-label="Series">' + seriesOptions(photo.seriesId) + '</select>' +
						(featured ? '<p class="quiet">Opening frame</p>' : '') +
					'</div>' +
					'<div class="moves">' +
						'<button class="icon-btn" data-action="up" type="button"' + (index === 0 ? ' disabled' : '') + '>Up</button>' +
						'<button class="icon-btn" data-action="down" type="button"' + (index === group.length - 1 ? ' disabled' : '') + '>Down</button>' +
						'<button class="icon-btn" data-action="feature" type="button"' + (featured ? ' disabled' : '') + '>Open with</button>' +
						'<button class="icon-btn danger" data-action="delete" type="button">Remove</button>' +
					'</div>';
				ol.appendChild(item);
			});
			list.appendChild(ol);
		});
	}

	function seriesOptions(selected) {
		return (exhibition.series || []).map(function (series) {
			return '<option value="' + escapeAttr(series.id) + '"' + (series.id === selected ? ' selected' : '') + '>' + escapeAttr(series.title) + '</option>';
		}).join('');
	}

	function render() {
		renderSelect();
		renderSeries();
		renderPhotos();
	}

	function groupedIds() {
		var ids = [];
		(exhibition.series || []).forEach(function (series) {
			(exhibition.photos || []).forEach(function (photo) {
				if (photo.seriesId === series.id) {
					ids.push(photo.id);
				}
			});
		});
		return ids;
	}

	form.addEventListener('submit', async function (event) {
		event.preventDefault();
		if (!input.files || !input.files[0]) {
			setStatus(uploadStatus, 'Choose a photograph first.', true);
			return;
		}
		if (!seriesSelect.value) {
			setStatus(uploadStatus, 'Choose a series so it has a wall to hang on.', true);
			return;
		}
		var data = new FormData(form);
		setStatus(uploadStatus, 'Preparing the print…');
		try {
			var response = await fetch('/api/studio/photos', {
				method: 'POST',
				body: data,
				credentials: 'same-origin'
			});
			var payload = await response.json();
			if (!response.ok) {
				throw new Error(payload.error || 'Could not hang that photograph.');
			}
			form.reset();
			preview.hidden = true;
			preview.removeAttribute('src');
			setStatus(uploadStatus, 'Hung on the wall.');
			await load();
		} catch (error) {
			setStatus(uploadStatus, error.message, true);
		}
	});

	seriesForm.addEventListener('submit', async function (event) {
		event.preventDefault();
		var data = new FormData(seriesForm);
		try {
			var response = await fetch('/api/studio/series', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({
					title: data.get('title'),
					kicker: data.get('kicker'),
					description: data.get('description')
				})
			});
			var payload = await response.json();
			if (!response.ok) {
				throw new Error(payload.error || 'Could not add that series.');
			}
			seriesForm.reset();
			setStatus(seriesStatus, 'Series added.');
			await load();
		} catch (error) {
			setStatus(seriesStatus, error.message, true);
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
			var body = {};
			body[field] = event.target.value;
			var response = await fetch('/api/studio/photos/' + card.dataset.id, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify(body)
			});
			if (!response.ok) {
				throw new Error('Could not save.');
			}
			await load();
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
		if (action === 'delete') {
			if (!window.confirm('Take this photograph off the wall?')) {
				return;
			}
			await fetch('/api/studio/photos/' + card.dataset.id, { method: 'DELETE', credentials: 'same-origin' });
			await load();
			setStatus(libraryStatus, 'Removed.');
			return;
		}
		if (action === 'feature') {
			await fetch('/api/studio/photos/' + card.dataset.id, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ featured: true })
			});
			await load();
			setStatus(libraryStatus, 'Set as the opening frame.');
			return;
		}
		var seriesId = card.querySelector('[data-field="seriesId"]').value;
		var groupCards = Array.prototype.slice.call(card.parentNode.querySelectorAll('.photo-card'));
		var ids = groupCards.map(function (node) { return node.dataset.id; });
		var index = ids.indexOf(card.dataset.id);
		if (action === 'up' && index > 0) {
			ids.splice(index, 1);
			ids.splice(index - 1, 0, card.dataset.id);
		}
		if (action === 'down' && index < ids.length - 1) {
			ids.splice(index, 1);
			ids.splice(index + 1, 0, card.dataset.id);
		}
		var all = groupedIds().filter(function (id) { return ids.indexOf(id) === -1; });
		var merged = [];
		(exhibition.series || []).forEach(function (series) {
			if (series.id === seriesId) {
				merged = merged.concat(ids);
			} else {
				(exhibition.photos || []).forEach(function (photo) {
					if (photo.seriesId === series.id) {
						merged.push(photo.id);
					}
				});
			}
		});
		all.forEach(function (id) {
			if (merged.indexOf(id) === -1) {
				merged.push(id);
			}
		});
		await fetch('/api/studio/photos/reorder', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'same-origin',
			body: JSON.stringify({ ids: merged })
		});
		await load();
	});

	seriesList.addEventListener('change', async function (event) {
		var field = event.target.getAttribute('data-series-field');
		var card = event.target.closest('.series-card');
		if (!field || !card) {
			return;
		}
		var body = {};
		body[field] = event.target.value;
		await fetch('/api/studio/series/' + card.dataset.id, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'same-origin',
			body: JSON.stringify(body)
		});
		await load();
		setStatus(seriesStatus, 'Saved.');
	});

	seriesList.addEventListener('click', async function (event) {
		var button = event.target.closest('[data-series-action]');
		var card = event.target.closest('.series-card');
		if (!button || !card) {
			return;
		}
		var action = button.getAttribute('data-series-action');
		if (action === 'delete') {
			if (!window.confirm('Remove this series? Photographs must be moved first.')) {
				return;
			}
			var response = await fetch('/api/studio/series/' + card.dataset.id, {
				method: 'DELETE',
				credentials: 'same-origin'
			});
			var payload = await response.json();
			if (!response.ok) {
				setStatus(seriesStatus, payload.error, true);
				return;
			}
			await load();
			setStatus(seriesStatus, 'Series removed.');
			return;
		}
		var ids = Array.prototype.slice.call(seriesList.querySelectorAll('.series-card')).map(function (node) {
			return node.dataset.id;
		});
		var index = ids.indexOf(card.dataset.id);
		if (action === 'up' && index > 0) {
			ids.splice(index, 1);
			ids.splice(index - 1, 0, card.dataset.id);
		}
		if (action === 'down' && index < ids.length - 1) {
			ids.splice(index, 1);
			ids.splice(index + 1, 0, card.dataset.id);
		}
		await fetch('/api/studio/series/reorder', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'same-origin',
			body: JSON.stringify({ ids: ids })
		});
		await load();
	});

	load().catch(function () {
		setStatus(libraryStatus, 'Could not load the studio.', true);
	});
})();
