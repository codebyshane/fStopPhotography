(function () {
	'use strict';

	var settings = {
		slideDuration: 500,
		layoutDuration: 750,
		thumbnailsPerRow: 2,
		mainSide: 'right'
	};

	var body = document.body;
	var main = document.getElementById('main');
	var thumbnails = document.getElementById('thumbnails');
	if (!main || !thumbnails) {
		return;
	}

	var viewer = document.createElement('div');
	viewer.id = 'viewer';
	viewer.innerHTML =
		'<div class="inner">' +
			'<button class="nav-previous" type="button" aria-label="Previous photograph"></button>' +
			'<button class="nav-next" type="button" aria-label="Next photograph"></button>' +
			'<button class="toggle" type="button" aria-label="Toggle gallery"></button>' +
		'</div>';
	body.appendChild(viewer);

	var navNext = viewer.querySelector('.nav-next');
	var navPrevious = viewer.querySelector('.nav-previous');
	var innerToggle = viewer.querySelector('.toggle');

	var mainToggle = document.createElement('button');
	mainToggle.className = 'toggle';
	mainToggle.type = 'button';
	mainToggle.setAttribute('aria-label', 'Close gallery panel');
	main.appendChild(mainToggle);

	var slides = [];
	var current = null;
	var locked = false;
	var touch = { x: null, y: null };

	function mq(query) {
		return window.matchMedia(query).matches;
	}

	function isXSmall() {
		return mq('(max-width: 480px)');
	}

	function isMedium() {
		return mq('(max-width: 980px)');
	}

	function switchTo(index, noHide) {
		if (current === index && !isXSmall()) {
			return;
		}
		if (locked || !slides[index]) {
			return;
		}

		locked = true;
		if (!noHide && isMedium()) {
			hide();
		}

		var oldSlide = current !== null ? slides[current] : null;
		var newSlide = slides[index];
		current = index;

		if (oldSlide) {
			oldSlide.parent.classList.remove('active');
			oldSlide.slide.classList.remove('active');
		}

		newSlide.parent.classList.add('active');

		function showNew() {
			if (oldSlide) {
				oldSlide.slide.remove();
			}
			viewer.appendChild(newSlide.slide);

			if (!newSlide.loaded) {
				newSlide.slide.classList.add('loading');
				var img = new Image();
				img.onload = function () {
					newSlide.image.style.backgroundImage = 'url("' + newSlide.url + '")';
					newSlide.backdrop.style.backgroundImage = 'url("' + newSlide.url + '")';
					newSlide.loaded = true;
					newSlide.slide.classList.remove('loading');
					newSlide.slide.classList.add('active');
					window.setTimeout(function () {
						locked = false;
					}, 100);
					preloadNeighbors(index);
				};
				img.src = newSlide.url;
			} else {
				window.setTimeout(function () {
					newSlide.slide.classList.add('active');
					window.setTimeout(function () {
						locked = false;
					}, 100);
					preloadNeighbors(index);
				}, 80);
			}
		}

		if (!oldSlide) {
			showNew();
		} else {
			window.setTimeout(showNew, settings.slideDuration);
		}
	}

	function preloadNeighbors(index) {
		[index + 1, index - 1].forEach(function (neighbor) {
			var slide = slides[neighbor];
			if (!slide || slide.loaded) {
				return;
			}
			var img = new Image();
			img.onload = function () {
				slide.image.style.backgroundImage = 'url("' + slide.url + '")';
				slide.backdrop.style.backgroundImage = 'url("' + slide.url + '")';
				slide.loaded = true;
			};
			img.src = slide.url;
		});
	}

	function next() {
		if (!slides.length) {
			return;
		}
		switchTo(current >= slides.length - 1 ? 0 : current + 1);
	}

	function previous() {
		if (!slides.length) {
			return;
		}
		switchTo(current <= 0 ? slides.length - 1 : current - 1);
	}

	function up() {
		if (body.classList.contains('fullscreen') || !slides.length) {
			return;
		}
		var tpr = settings.thumbnailsPerRow;
		if (current <= tpr - 1) {
			switchTo(slides.length - (tpr - 1 - current) - 1);
		} else {
			switchTo(current - tpr);
		}
	}

	function down() {
		if (body.classList.contains('fullscreen') || !slides.length) {
			return;
		}
		var tpr = settings.thumbnailsPerRow;
		if (current >= slides.length - tpr) {
			switchTo(current - slides.length + tpr);
		} else {
			switchTo(current + tpr);
		}
	}

	function show() {
		if (!body.classList.contains('fullscreen')) {
			return;
		}
		body.classList.remove('fullscreen');
		innerToggle.classList.remove('is-open');
		main.focus();
	}

	function hide() {
		if (body.classList.contains('fullscreen')) {
			return;
		}
		body.classList.add('fullscreen');
		innerToggle.classList.add('is-open');
		main.blur();
	}

	function toggle() {
		if (body.classList.contains('fullscreen')) {
			show();
		} else {
			hide();
		}
	}

	Array.prototype.forEach.call(thumbnails.children, function (article, index) {
		var thumb = article.querySelector('.thumbnail');
		if (!thumb) {
			return;
		}

		var captionSource = [];
		Array.prototype.forEach.call(article.children, function (child) {
			if (child !== thumb) {
				captionSource.push(child);
			}
		});

		var slide = document.createElement('div');
		slide.className = 'slide';
		slide.innerHTML = '<div class="backdrop"></div><div class="image"></div><div class="caption"></div>';
		var caption = slide.querySelector('.caption');
		captionSource.forEach(function (node) {
			caption.appendChild(node.cloneNode(true));
		});

		var image = slide.querySelector('.image');
		var backdrop = slide.querySelector('.backdrop');
		var position = thumb.getAttribute('data-position') || 'center';
		image.style.backgroundPosition = position;
		backdrop.style.backgroundPosition = position;

		var item = {
			parent: article,
			slide: slide,
			image: image,
			backdrop: backdrop,
			url: thumb.getAttribute('href'),
			loaded: false
		};
		slides.push(item);
		thumb.setAttribute('data-index', String(index));
		article.tabIndex = -1;

		thumb.addEventListener('click', function (event) {
			event.preventDefault();
			event.stopPropagation();
			if (locked) {
				thumb.blur();
			}
			switchTo(Number(thumb.getAttribute('data-index')));
		});
	});

	window.addEventListener('load', function () {
		body.classList.remove('is-preload-0');
		window.setTimeout(function () {
			body.classList.remove('is-preload-1');
		}, 80);
		window.setTimeout(function () {
			body.classList.remove('is-preload-2');
		}, 80 + Math.max(settings.layoutDuration - 150, 0));
	});

	var resizeTimeout;
	window.addEventListener('resize', function () {
		body.classList.add('is-preload-0');
		window.clearTimeout(resizeTimeout);
		resizeTimeout = window.setTimeout(function () {
			body.classList.remove('is-preload-0');
		}, 100);
	});

	viewer.addEventListener('touchend', function () {
		if (isMedium()) {
			hide();
		}
	});

	viewer.addEventListener('touchstart', function (event) {
		touch.x = event.touches[0].pageX;
		touch.y = event.touches[0].pageY;
	});

	viewer.addEventListener('touchmove', function (event) {
		if (touch.x === null || touch.y === null) {
			return;
		}
		var diffX = touch.x - event.touches[0].pageX;
		var diffY = touch.y - event.touches[0].pageY;
		if (Math.abs(diffY) < 20 && diffX > 50) {
			next();
		} else if (Math.abs(diffY) < 20 && diffX < -50) {
			previous();
		}
	});

	mainToggle.addEventListener('click', toggle);
	innerToggle.addEventListener('click', toggle);
	navNext.addEventListener('click', next);
	navPrevious.addEventListener('click', previous);

	window.addEventListener('keydown', function (event) {
		if (isXSmall()) {
			return;
		}
		var tag = (event.target && event.target.tagName) || '';
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
			return;
		}
		switch (event.key) {
			case 'Escape':
				toggle();
				break;
			case 'ArrowUp':
				event.preventDefault();
				up();
				break;
			case 'ArrowDown':
				event.preventDefault();
				down();
				break;
			case ' ':
			case 'ArrowRight':
				event.preventDefault();
				next();
				break;
			case 'ArrowLeft':
				event.preventDefault();
				previous();
				break;
			default:
				break;
		}
	});

	if (!isXSmall() && slides.length) {
		switchTo(0, true);
	}
})();
