(function () {
	'use strict';

	var node = document.getElementById('series-data');
	var viewer = document.getElementById('viewer');
	var filmstrip = document.getElementById('filmstrip');
	var toggle = document.getElementById('strip-toggle');
	if (!node || !viewer) {
		return;
	}

	var data = JSON.parse(node.textContent);
	var photos = data.photos || [];
	var index = data.index || 0;
	var titleEl = document.getElementById('photo-title');
	var locationEl = document.getElementById('photo-location');
	var counterEl = document.getElementById('counter');
	var imageEl = viewer.querySelector('.image');
	var backdropEl = viewer.querySelector('.backdrop');
	var thumbs = filmstrip ? filmstrip.querySelectorAll('.strip-thumb') : [];
	var locked = false;

	function show(next, instant) {
		if (!photos.length || locked) {
			return;
		}
		if (next < 0) {
			next = photos.length - 1;
		}
		if (next >= photos.length) {
			next = 0;
		}
		index = next;
		var photo = photos[index];
		locked = true;
		if (!instant) {
			imageEl.style.opacity = '0';
		}
		var img = new Image();
		img.onload = function () {
			imageEl.style.backgroundImage = 'url("' + photo.full + '")';
			backdropEl.style.backgroundImage = 'url("' + photo.full + '")';
			imageEl.style.backgroundPosition = photo.position || 'center';
			backdropEl.style.backgroundPosition = photo.position || 'center';
			titleEl.textContent = photo.title;
			locationEl.textContent = photo.location || '';
			counterEl.textContent = (index + 1) + ' / ' + photos.length;
			thumbs.forEach(function (thumb, i) {
				thumb.classList.toggle('is-active', i === index);
			});
			var active = thumbs[index];
			if (active && active.scrollIntoView) {
				active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
			}
			imageEl.style.opacity = '1';
			window.setTimeout(function () {
				locked = false;
			}, 180);
			preload(index + 1);
			preload(index - 1);
			if (window.history && window.history.replaceState) {
				window.history.replaceState({}, '', '/work/' + data.slug + '?p=' + encodeURIComponent(photo.id));
			}
		};
		img.src = photo.full;
	}

	function preload(i) {
		if (i < 0 || i >= photos.length) {
			return;
		}
		var img = new Image();
		img.src = photos[i].full;
	}

	function next() {
		show(index + 1);
	}

	function previous() {
		show(index - 1);
	}

	viewer.querySelector('.nav-next').addEventListener('click', next);
	viewer.querySelector('.nav-previous').addEventListener('click', previous);

	thumbs.forEach(function (thumb) {
		thumb.addEventListener('click', function () {
			show(Number(thumb.getAttribute('data-index')));
		});
	});

	if (toggle) {
		toggle.addEventListener('click', function () {
			document.body.classList.toggle('strip-hidden');
			toggle.textContent = document.body.classList.contains('strip-hidden') ? 'Index' : 'Hide index';
		});
	}

	var touch = { x: null, y: null };
	viewer.addEventListener('touchstart', function (event) {
		touch.x = event.touches[0].pageX;
		touch.y = event.touches[0].pageY;
	}, { passive: true });
	viewer.addEventListener('touchend', function (event) {
		if (touch.x === null) {
			return;
		}
		var diffX = touch.x - event.changedTouches[0].pageX;
		if (Math.abs(diffX) > 50) {
			if (diffX > 0) {
				next();
			} else {
				previous();
			}
		}
		touch.x = null;
	});

	window.addEventListener('keydown', function (event) {
		if (event.key === 'ArrowRight' || event.key === ' ') {
			event.preventDefault();
			next();
		} else if (event.key === 'ArrowLeft') {
			event.preventDefault();
			previous();
		} else if (event.key === 'i' || event.key === 'I' || event.key === 'f' || event.key === 'F') {
			if (toggle) {
				toggle.click();
			}
		} else if (event.key === 'Escape') {
			window.location.href = '/#work';
		}
	});

	show(index, true);
	if (toggle) {
		toggle.textContent = 'Hide index';
	}
})();
