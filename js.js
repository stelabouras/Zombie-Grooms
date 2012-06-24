window.requestAnimFrame = (function(){
	return  window.requestAnimationFrame       || 
			window.webkitRequestAnimationFrame || 
			window.mozRequestAnimationFrame    || 
			window.oRequestAnimationFrame      || 
			window.msRequestAnimationFrame     || 
			function( callback ){
				window.setTimeout(callback, 1000 / 60);
			};
})();

var AssetManager = (function() {

	var load = function(filename, callback) {

		var self 	= this;

		var image 	= new Image();
		image.src 	= filename;

		image.addEventListener('load', function() { callback && callback(image, filename); }, false);

		return self;
	};

	var loadAll = function(resources, callback) {

		this.loaded = false;

		var readyResources	= {};
		var resourcesLoaded = 0;
		var self 			= this;

		for(var i = 0; i < resources.length; i++) {

			this.load(resources[i], function(image, filename) {

				readyResources[filename] = image;
				resourcesLoaded++;

				if(resourcesLoaded == resources.length) {

					self.loaded = true;
					callback && callback(readyResources);
				}
			});
		}
	};

	return { 
		'load' 		: load,
		'loadAll'	: loadAll
	};

})();

function BufferLoader(context, urlList, callback) {
	this.context = context;
	this.urlList = urlList;
	this.onload = callback;
	this.bufferList = new Array();
	this.loadCount = 0;
}

BufferLoader.prototype.loadBuffer = function(url, index) {

  var request = new XMLHttpRequest();

  request.open("GET", url, true);
  request.responseType = "arraybuffer";

  var loader = this;

  request.onload = function() {
    // Asynchronously decode the audio file data in request.response
    loader.context.decodeAudioData(
      request.response,
      function(buffer) {
        if (!buffer) {
          alert('error decoding file data: ' + url);
          return;
        }
        loader.bufferList[index] = buffer;
        if (++loader.loadCount == loader.urlList.length)
          loader.onload(loader.bufferList);
      }
    );
  }

  request.onerror = function() {
    alert('BufferLoader: XHR error');
  }

  request.send();
}

BufferLoader.prototype.load = function() {
  for (var i = 0; i < this.urlList.length; ++i)
  this.loadBuffer(this.urlList[i], i);
}

var SoundManager = (function() {

	var init = function() {

		this.loaded 	= false;

		try {
			this.context = new AudioContext();
		} catch(e) {
			try {
				this.context = new webkitAudioContext();
			} catch(e) {

			}
		}

		if(!this.context) {

			this.loaded = true;
			return;
		}

		var self 	= this;

	 	bufferLoader = new BufferLoader(
    						this.context,
							[
								'shoot.wav',
								'jump.wav',
								'hit.wav',
								'bg.mp3',
								'hitenemy.wav',
								'coin.wav'
							],
							function(bufferList) {

								self.loaded = true;

								Player.shootSound 	= bufferList[0];
								Player.jumpSound 	= bufferList[1];
								Player.hitSound 	= bufferList[2];
								Game.bgSound		= bufferList[3];
								Game.hitenemySound	= bufferList[4];
								Game.coinSound		= bufferList[5];
							});

		bufferLoader.load();
	};

	var playSound = function(buffer, time, repeat) {

		if(typeof this.context == 'undefined')
			return;

		var source = this.context.createBufferSource();

		source.stopped= false;
		source.buffer = buffer;
		source.connect(this.context.destination);
		source.noteOn(time);

		if(repeat) {

			var self 	= this;
			var timer 	= setTimeout(function() {

				clearTimeout(timer);

				if(!source.stopped)
					self.playSound(buffer, time, true);

			}, buffer.duration * 1000);
		}

		return source;
	};

	var stopSound = function(source) {

		if(typeof this.context == 'undefined')
			return;

		if(typeof source == 'undefined')
			return;
		
		if(source.stopped === true)
			return;

		source.stopped = true;
		source.disconnect(0);
	};

	var resumeSound = function(source) {

		if(typeof this.context == 'undefined')
			return;

		if(typeof source == 'undefined')
			return;

		if(source.stopped === false)
			return;

		source.stopped = false;
		source.disconnect(0);
		source.connect(this.context.destination);
	};

	return {
		'initialize' 	: init,
		'playSound'		: playSound,
		'stopSound'		: stopSound,
		'resumeSound'	: resumeSound
	};

})();

var Powerup = function(x, y) {

	var spriteLimit 	= 4;
	var spriteSize		= 16;

	this.fastCycle 		= 0;
	this.spriteCycle	= 0;

	this.x = x;
	this.y = y;
	this.collected = false;

	var collision = function() {

		if(Collision.check(Player.x, Player.y, 16, 16, this.x, this.y, 16, 16)) {

			this.collected = true;
			Game.score += 100;

			SoundManager.playSound(Game.coinSound, 0);
		}
	};

	this.update = function() {

		this.spriteCycle = parseInt(++this.fastCycle / spriteLimit);

		if(this.spriteCycle > spriteLimit - 1) {

			this.fastCycle 		= 0;
			this.spriteCycle 	= 0;
		}

		collision.call(this);
	};

	this.draw = function() {

		Graphics.renderSubImageAtPoint(Game.powerupSprite, this.x, this.y, this.spriteCycle * 16, 0, 16, 16, 0, 1); 
	};
};

var Enemy = function(life) {

	var spriteLimit	 	= 4;
	var spriteSize		= 16;
	var maxLife 		= (life ? life : 5);

	this.heading 		= 0;
	this.life 			= maxLife;
	this.spriteMove 	= 0;
	this.fastCycle 		= 0;
	this.spriteCycle 	= 0;

	this.alive	= true;
	this.x 		= (Math.random(0,1) < .5 && Game.age > 50 ? -20 : Game.boundaries.width + 20);
	this.y 		= Player.startPos.y;

	var collision = function() {

		for(var i in Game.projectiles) {

			var projectile = Game.projectiles[i];

			if(Collision.check(projectile.x, projectile.y, 4, 4, this.x, this.y, 16, 16)) {

				Game.score			+= 50;
				this.life--;

				SoundManager.playSound(Game.hitenemySound, 0);

				if(this.life == 0) {

					Game.powerups.push(new Powerup(this.x, this.y));

					this.alive 			= false;
					projectile.alive 	= false;
				}

				return;
			}
		}
	};

	this.update = function(ts) {

		var distance= Math.abs(Player.x - this.x);
		
		this.heading = (Player.x - this.x) / distance;

		this.spriteMove = (distance < 100 ? (this.heading < 0 ? 16 : 48) : (this.heading < 0 ? 0 : 32));

		this.x += this.heading * .7;

		this.spriteCycle = parseInt(++this.fastCycle / spriteLimit);

		if(this.spriteCycle > spriteLimit - 1) {

			this.fastCycle 		= 0;
			this.spriteCycle 	= 0;
		}

		collision.call(this);
	};

	this.draw = function() { 

		Graphics.renderSubImageAtPoint(Game.enemySprite, this.x, this.y, this.spriteCycle * 16, this.spriteMove, 16, 16, 0, 1); 

		var health = 16 * this.life / maxLife;

		Game.context.fillStyle = "rgb(255,0,0)";
	    Game.context.fillRect(this.x,this.y + 20,16,2);
		Game.context.fillStyle = "rgb(0,255,0)";
	    Game.context.fillRect(this.x,this.y + 20,health,2);
    	Game.context.strokeRect(this.x,this.y + 20,16,3); 
	};
};

var Projectile = function() {

	var ttl 			= 150;
	var age 			= 0;
	var heading 		= Player.heading;

	this.alive 			= true;
	this.x  			= Player.x + (Player.heading > 0 ? 16 : 0);
	this.y  			= Player.y + 8;

	this.update = function() {

		age++;

		if(age > ttl) {

			this.alive = false;
			return;
		}

		this.x += heading * 5;
	};

	this.draw = function() {

		if(!this.alive)
			return;

		Game.context.fillStyle = "rgb(255,0,0)";  
		Game.context.beginPath();
		Game.context.arc(this.x, this.y, 2, 0, Math.PI*2, true); 
		Game.context.closePath();
		Game.context.fill();
	};
};

var Player = (function() {

	var init = function() {

		this.spriteLoaded 	= false;
		this.lives 			= 3;
		this.ignoreShoot	= false;

		begin.call(this);

		var self = this;

	};

	var begin = function() {

		this.startPos 		= {
			'x'	: 20,
			'y'	: 120
		};
		this.heading		= 1;
		this.xSpeed 		= 0;
		this.ySpeed 		= 0;
		this.x 				= this.startPos.x;
		this.y 				= this.startPos.y;
		this.health 		= 100;
		this.fastCycle	 	= 0;
		this.spriteCycle 	= 0;
		this.jumping 		= false;
		this.shooting 		= false;
		this.onSolidGround 	= true;
	};

	var collision = function() {

		for(var i in Game.enemies) {

			var enemy = Game.enemies[i];

			if(Collision.check(enemy.x, enemy.y, 16, 16, this.x, this.y, 16, 16)) {

				SoundManager.playSound(this.hitSound, 0);
				this.health = (this.health - 1 < 0 ? 0 : this.health - 1);
//				this.x += enemy.heading * 15;
			}
		}
	};

	var update = function() {

		var oldShooting = this.shooting;
 	
		this.xSpeed 	= (Controller.leftPressed ? -2 : (Controller.rightPressed ? 2 : 0));
		this.heading	= (Controller.leftPressed ? -1 : (Controller.rightPressed ? 1 : this.heading));
		this.jumping	= ((Controller.jumpPressed && !this.jumping) || this.jumping);
		this.shooting	= ((Controller.shootPressed && !this.shooting) || this.shooting);

		if(Controller.shootPressed && !oldShooting && this.shooting) {

			if(this.ignoreShoot)
				this.ignoreShoot = false;
			else {
				SoundManager.playSound(this.shootSound, 0);
				Game.projectiles.push(new Projectile());
			}
		}

		if(this.shooting)
			this.xSpeed = 0;

		if(Controller.jumpPressed && this.xSpeed != 0)
			this.xSpeed *= 2;

		this.spriteMove 	= 0;
		this.spriteLimit 	= 14;

		if(this.xSpeed != 0) {

			this.spriteLimit = 4;
			this.spriteMove  = (this.xSpeed < 0 ? 32 : 48);

		} else if(this.heading == 1)
			this.spriteMove = 16;

		if(this.jumping) {

			this.spriteLimit 	= (this.ySpeed < 0 ? 6 : 5);
			this.spriteMove 	= (this.heading < 0 ? (this.ySpeed < 0 ? 64 : 112) : (this.ySpeed < 0 ? 96 : 80));
		}

		if(this.shooting) {
			this.spriteLimit 	= 12;
			this.spriteMove 	= (this.heading < 0 ? 128 : 144);
		}

		this.spriteCycle = parseInt(++this.fastCycle / (this.shooting ? 2 : this.spriteLimit));

		if(this.onSolidGround && Controller.jumpPressed) {
			SoundManager.playSound(this.jumpSound,0);
			this.ySpeed = -7;
		} else if(!this.onSolidGround)
			this.ySpeed += .5;

		if(Controller.jumpPressed && !this.onSolidGround && this.ySpeed > 0)
			this.ySpeed -= .1;

		if(this.ySpeed > 5)
			this.ySpeed = 5;

		if(this.spriteCycle > this.spriteLimit - 1) {

			this.fastCycle 		= 0;
			this.spriteCycle 	= 0;

			if(this.shooting)
				this.shooting = false;
		}

		this.x += this.xSpeed;
		this.y += this.ySpeed;

		if(this.x < 0) {

			this.x 		= 0;
			this.xSpeed = 0;
		}

		if(this.x + 16 > Game.boundaries.width) {

			this.x 		= Game.boundaries.width - 16;
			this.xSpeed = 0;
		}

		if(this.y >= this.startPos.y) {

			this.jumping 		= false;
			this.y 				= this.startPos.y;
			this.ySpeed 		= 0;
			this.onSolidGround 	= true;

		} else
			this.onSolidGround = false;

		collision.call(this);
	};

	var draw = function() { Graphics.renderSubImageAtPoint(this.playerImg, this.x, this.y, this.spriteCycle * 16, this.spriteMove, 16, 16, 0, 1); };

	return {
		'initialize': init,
		'begin'		: begin,
		'update'	: update,
		'draw'		: draw
	};

})();

var Controller = (function() {

	var init = function() {

		var self = this;

		window.addEventListener('keydown', function(event) {

			switch(event.keyCode) {

				case 65:
				case 37: 

					self.leftPressed = true;
					event.preventDefault();
					return false;

				break;

				case 68:
				case 39:

					self.rightPressed = true;
					event.preventDefault();
					return false;

				break;

				case 90:
				case 38:
				case 87:
				case 32:

					self.jumpPressed = true;
					event.preventDefault();
					return false;

				break;

				case 88:

					self.shootPressed = true;
					event.preventDefault();
					return false;

				break;
			}

		}, false);

		window.addEventListener('keyup', function(event) {

			switch(event.keyCode) {

				case 65:
				case 37: 

					self.leftPressed = false;
					event.preventDefault();
					return false;

				break;

				case 68:
				case 39:

					self.rightPressed = false;
					event.preventDefault();
					return false;

				break;

				case 90:
				case 38:
				case 87:
				case 32:

					self.jumpPressed = false;
					event.preventDefault();
					return false;
					
				break;

				case 88:

					self.shootPressed = false;
					event.preventDefault();
					return false;

				break;
			}
		});
	};

	return {
		'listen' 		: init,
		'leftPressed'	: false,
		'rightPressed'	: false,
		'jumpPressed'	: false,
		'shootPressed'	: false
	};

})();

var Collision = {

	// AABB collision test
	'check' : function(x1, y1, width1, height1, x2, y2, width2, height2) {

		var collides = false;

		if ((x2<=x1+width1) && (x2+width2>=x1) && (y2<=y1+height1) && (y2+height2>=y1)) collides=true;

		return collides;
	}
}

var USE_BLITTING = false;

var Graphics = {

	'renderAtPoint' : function(imageObject, x, y) {
		Game.context && Game.context.drawImage(imageObject,x,y,imageObject.width, imageObject.height);
	},

	'renderSubImageAtPoint' : function(imageObject, x, y, sourceX, sourceY, width, height, rotation, scale) {

		var targetX = (x*scale)|0;
		var targetY = (y*scale)|0;
		var dWidth 	= width*scale;
		var dHeight = height*scale;

		if(!USE_BLITTING)
			Game.context.drawImage(imageObject, sourceX, sourceY, width, height, targetX, targetY, dWidth, dHeight);
		else {

			var imageData = Game.context.getImageData(targetX, targetY, dWidth, dHeight);

			Game.context.drawImage(imageObject, sourceX, sourceY, width, height, targetX, targetY, dWidth, dHeight);

			var newImageData = Game.context.getImageData(targetX, targetY, dWidth, dHeight);

			for(var y = 0; y < dHeight; y++) {

				var inpos 	= y * dWidth * 4;
				var ninpos	= inpos;
				var outpos	= inpos;

				for (var x = 0; x < dWidth; x++) {
					
					r = imageData.data[inpos++];
					g = imageData.data[inpos++];
					b = imageData.data[inpos++];
					a = imageData.data[inpos++];

					nR = newImageData.data[ninpos++];
					nG = newImageData.data[ninpos++];
					nB = newImageData.data[ninpos++];
					nA = newImageData.data[ninpos++];

					if(nR == 255 && nG == 0 && nB == 255 && nA == 255) {

						imageData.data[outpos++] = r;
						imageData.data[outpos++] = g;
						imageData.data[outpos++] = b;
						imageData.data[outpos++] = a;

					} else {

						imageData.data[outpos++] = nR;
						imageData.data[outpos++] = nG;
						imageData.data[outpos++] = nB;
						imageData.data[outpos++] = nA;
					}
				}
			}

			Game.context.putImageData(imageData, targetX, targetY);
		}
	}
};

var Game = (function() {

	var init = function() {

		this.boundaries = {
			'width' : 320,
			'height': 200
		};

		this.hasStarted 	= false;
		this.age 			= 0;
		this.isOver 		= false;
		this.score			= 0;
		this.powerups 		= [];
		this.enemies 		= [];
		this.projectiles 	= [];
		this.heartsLoaded 	= false;
		this.backLoaded 	= false;
		this.enemyLoaded 	= false;
		this.numbersLoaded 	= false;
		this.canvas 		= document.getElementById('game');

		this.canvas.setAttribute('width', 	this.boundaries.width);
		this.canvas.setAttribute('height', 	this.boundaries.height);

		this.context = this.canvas.getContext('2d');
        this.context.mozImageSmoothingEnabled = false;
	
		Player.initialize();
		SoundManager.initialize();
		Controller.listen();

		var self = this;

		AssetManager.loadAll([
			'back.png',
			'hearts.png',
			'enemy.png',
			'numbers.png',
			'powerup.png',
			'player.png',
			'welcome.png'
		], function(resources) {

			self.welcomebg 		= resources['welcome.png'];
			self.background 	= resources['back.png'];
			self.heartsSprite 	= resources['hearts.png'];
			self.enemySprite 	= resources['enemy.png'];
			self.numbersSprite 	= resources['numbers.png'];
			self.powerupSprite 	= resources['powerup.png'];
			Player.playerImg	= resources['player.png'];
		});

		window.addEventListener('focus', function() { if(!self.isOver) { SoundManager.resumeSound(self.soundSource); } });
		window.addEventListener('blur', function() { if(!self.isOver) { SoundManager.stopSound(self.soundSource); } });		

		gameLoop.call(this, (+new Date()));
	};

	var restart = function() {

		document.getElementById('container').removeChild(Game.overlay);
		this.overlay 		= null;

		this.isOver 		= false;
		this.powerups 		= [];
		this.enemies 		= [];
		this.projectiles 	= [];
		this.score 			= 0;
		this.age 			= 0;
		Player.lives 		= 3;

		Player.begin();
	};

	var gameover = function() {

		SoundManager.stopSound(this.soundSource);

		this.isOver = true;
		this.overlay = document.createElement('div');
		var html 	= '';

		html += '<h2>Gameover! Score: ' + this.score + '</h2>';
		html += '<p><button onclick="Game.restart();">Play again!</button></p>';

		if(this.score > 0)
			html += '<p><button onclick="Game.share();">Tweet your score!</button></p>';

		this.overlay.id 		= 'overlay';
		this.overlay.innerHTML 	= html;

		document.getElementById('container').appendChild(this.overlay);
	};

	var gameLoop = function(ts) {

		requestAnimFrame(gameLoop.bind(this));

		if(this.isOver)
			return;

		if(!AssetManager.loaded || !SoundManager.loaded) {

			if(!this.overlay) {

				this.overlay 			= document.createElement('div');
				this.overlay.innerHTML 	= '<h2><progress>Loading&hellip;</progress></h2>';
				this.overlay.id 		= 'overlay';

				document.getElementById('container').appendChild(this.overlay);
			}

			return;
		}

		if(this.overlay) {

			document.getElementById('container').removeChild(Game.overlay);
			this.overlay = null;
		}

		if(!this.hasStarted) {

			Graphics.renderAtPoint(this.welcomebg, 0, 0);

			if(Controller.shootPressed) {
				Player.ignoreShoot 	= true;
				this.hasStarted 	= true;
			}

			return;
		}

		if(Player.health == 0) {

			Player.lives = (Player.lives - 1 < 0 ? 0 : Player.lives - 1);

			if(Player.lives == 0) {

				gameover.call(this);
				return;
			}

			Player.begin();
			this.age 			= 0;
			this.enemies 		= [];
			this.projectiles 	= [];
		}

		if(this.age == 0) {

			this.soundSource && SoundManager.stopSound(this.soundSource);
			this.soundSource = SoundManager.playSound(this.bgSound, 0, true);
		}

		if(this.age % 100 == 0)
			this.enemies.push(new Enemy((this.age > 200 ? 20 : 5)));

		Player.update();

		for(var i in this.projectiles)
			this.projectiles[i].update();

		for(var i in this.enemies)
			this.enemies[i].update(ts);

		for(var i in this.powerups)
			this.powerups[i].update(ts);

		render.call(this);

		// Garbage collector
		var newProjectiles = [];

		for(var i in this.projectiles) {

			if(this.projectiles[i].alive)
				newProjectiles.push(this.projectiles[i]);
		}

		delete this.projectiles;
		
		this.projectiles = newProjectiles;

		var newEnemies = [];

		for(var i in this.enemies) {
		
			if(this.enemies[i].alive)
				newEnemies.push(this.enemies[i]);
		}

		delete this.enemies;

		this.enemies = newEnemies;

		var newPowerups = [];

		for(var i in this.powerups) {
		
			if(!this.powerups[i].collected)
				newPowerups.push(this.powerups[i]);
		}

		delete this.powerups;

		this.powerups = newPowerups;

		this.age++;
	};

	var render = function() {

		this.context.fillStyle = "rgb(0,0,0)";  
		this.context.fillRect (0, 0, 500, 500);  

		Graphics.renderAtPoint(this.background, 0, 0);

		Player.draw();

		for(var i in this.projectiles)
			this.projectiles[i].draw();

		for(var i in this.enemies)
			this.enemies[i].draw();

		for(var i in this.powerups)
			this.powerups[i].draw();

		renderUIElements.call(this);
	};

	var renderUIElements = function() {

		for(var i = 0; i < Player.lives; i++)
			Graphics.renderSubImageAtPoint(this.heartsSprite, (i * 32 + 10), 10, 0, 0, 32, 32, 0, 1); 

		if(Player.health > 0) {
			this.context.fillStyle = "rgb(255,255,255)";
		    this.context.fillRect(Game.boundaries.width - 110,23, 100,10);
		}

		if(Player.health > 70)
			this.context.fillStyle = "rgb(0,255,0)"; 
		else if(Player.health > 20)
			this.context.fillStyle = "rgb(255,255,0)";
		else
			this.context.fillStyle = "rgb(255,0,0)";

		this.context.strokeStyle = "rgba(0,0,0,.5)"

		if(Player.health > 0) {

		    this.context.fillRect(Game.boundaries.width - 110,23,Player.health,10);
	    	this.context.strokeRect(Game.boundaries.width - 110,23,100,10);  
	    }

    	var scoreString = this.score + "";

    	for(var i = 0; i < scoreString.length; i++) {

    		var pos = parseInt(scoreString.substr(i, 1));
			Graphics.renderSubImageAtPoint(this.numbersSprite, (i * 9 + 10), Game.boundaries.height - 15, pos * 9, 0, 9, 8, 0, 1);
    	}
	};

	var share = function() {

		if(typeof window.FormData === undefined) {

			var msg 		= unescape(encodeURIComponent("I scored " + Game.score + " points in Zombie Grooms!"));		
			var url 		= unescape(encodeURIComponent("http://bit.ly/zombiegrooms")); 
			
			window.open("https://twitter.com/intent/tweet?hashtags=zombiegrooms&related=stelabouras&url="+ url +"&text="+ msg,"Zombie Grooms!","width=480,height=240");

		} else {

			try {
				var img = this.canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
			} catch(e) {
				var img = this.canvas.toDataURL().split(',')[1];
			}

		   var fd = new FormData();
		   fd.append("image", 	img);
		   fd.append("key", 	"5564634833bee00b590e8c03614c556e");
		   fd.append("type", 	"base64");

		   var xhr = new XMLHttpRequest();

		   xhr.open("POST", "http://api.imgur.com/2/upload.json");
		   xhr.onload = function() {

		   		var imageURL 	= JSON.parse(xhr.responseText).upload.links.imgur_page;
				var msg 		= unescape(encodeURIComponent("I scored " + Game.score + " points in Zombie Grooms! My last moment was like this: " + imageURL));		
				var url 		= unescape(encodeURIComponent("http://bit.ly/zombiegrooms")); 
				
				window.open("https://twitter.com/intent/tweet?hashtags=zombiegrooms&related=stelabouras&url="+ url +"&text="+ msg,"Zombie Grooms!","width=480,height=240");
		   };

		   xhr.send(fd);
		}
	};

	return { 
		'initialize' 	: init,
		'restart'		: restart,
		'share'			: share
	};
})();

window.onload = function() { Game.initialize(); };