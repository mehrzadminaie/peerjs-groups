"user strict"
var board = $('#board');
var canvas = board[0].getContext('2d');
var userID2Tag = $('#user-id2');
var opponentUserIDTag = $('#opponent-user-id');

var myUserID, opponentUserID, gamePhase, color, boardState;
var myTurn = false;
var boardPadding, squareSize, pieceRadius;
var hitX, hitY;
var group;

const Color = {
	WHITE: 1,
	BLACK: 2,
	NEITHER: 3,
}

const MessageType = {
	PROPOSE_GAME: 1,
	PLACE_PIECE: 2,
	MOVE_PIECE: 3,
}

function proposeGame(colorToPlayAs) {
	return {
		messageType: MessageType.PROPOSE_GAME,
		color: colorToPlayAs,
	};
}

function placePiece(x, y, colorToPlace) {
	return {
		messageType: MessageType.PLACE_PIECE,
		x: x,
		y: y,
		color: colorToPlace,
	};
}

function movePiece(startX, startY, endX, endY) {
	return {
		messageType: MessageType.MOVE_PIECE,
		startX: startX,
		startY: startY,
		endX: endX,
		endY: endY,
	};
}

function newGame() {
	boardState = [
		[Color.NEITHER, Color.NEITHER, Color.NEITHER],
		[Color.NEITHER, Color.NEITHER, Color.NEITHER],
		[Color.NEITHER, Color.NEITHER, Color.NEITHER]
	];
	gamePhase = MessageType.PLACE_PIECE;
	myTurn = color === Color.WHITE;
	drawBoard();
}

function checkWin() {
	if (boardState[1][1] !== Color.NEITHER) {
		if (boardState[0][1] === boardState[1][1] && boardState[1][1] === boardState[2][1]) {
			//Horizontal middle line
			return boardState[1][1];
		} else if (boardState[1][0] === boardState[1][1] && boardState[1][1] === boardState[1][2]) {
			//Vertical middle line
			return boardState[1][1];
		} else if (boardState[0][0] === boardState[1][1] && boardState[1][1] === boardState[2][2]) {
			//Diagonal left-to-right line
			return boardState[1][1];
		} else if (boardState[2][0] === boardState[1][1] && boardState[1][1] === boardState[0][2]) {
			//Diagonal right-to-left line
			return boardState[1][1];
		}
	}
	if (boardState[0][0] !== Color.NEITHER) {
		if (boardState[0][0] === boardState[0][1] && boardState[0][1] === boardState[0][2]) {
			//Left line
			return boardState[0][0];
		} else if (boardState[0][0] === boardState[1][0] && boardState[1][0] === boardState[2][0]) {
			//Top line
			return boardState[0][0];
		}
	}
	if (boardState[2][2] !== Color.NEITHER) {
		if (boardState[2][0] === boardState[2][1] && boardState[2][1] === boardState[2][2]) {
			//Right line
			return boardState[2][2];
		} else if (boardState[0][2] === boardState[1][2] && boardState[1][2] === boardState[2][2]) {
			//Bottom line
			return boardState[2][2];
		}
	}
	return Color.NEITHER;
}

function initializeNetworking() {
	let connectionOptions = parseSignallingURL($('#server-url').val());

	group = new PeerGroup(
		function (error) {
			console.error(error.type + ': ' + error);
			debugger;
		},
		connectionOptions
	);

	group.addEventListener('joined', function (event) {
		let numUsers = group.userIDs.size;
		if (numUsers === 1) {
			gamePhase = MessageType.PROPOSE_GAME;
			alertArea.append(`
				<div class="alert alert-info" id="waiting-for-player-alert">
					Connected to ${event.sessionID}. Waiting for another player to join.
				</div>
			`);
		} else if (numUsers === 2) {
			for (let someUserID of group.userIDs) {
				if (someUserID !== myUserID) {
					opponentUserID = someUserID;
					break;
				}
			}
			userID2Tag.html(myUserID);
			opponentUserIDTag.html(opponentUserID);
			if (Math.random() >= 0.5) {
				color = Color.WHITE;
			} else {
				color = Color.BLACK;
			}
			group.send(proposeGame(color));
		} else {
			color = Color.NEITHER;
			newGame();
		}
	});

	group.addEventListener('message', function (event) {
		let data = event.message;
		let messageType = data.messageType;
		if (messageType === MessageType.PROPOSE_GAME) {
			//User proposes a new game.
			if (gamePhase === MessageType.PROPOSE_GAME) {
				//And we're waiting for someone to play with.
				$('#waiting-for-player-alert').remove();
				opponentUserID = event.userID;
				userID2Tag.html(myUserID);
				opponentUserIDTag.html(opponentUserID);
				if (data.color === Color.WHITE) {
					color = Color.BLACK;
				} else {
					color = Color.WHITE;
				}
				newGame();
			} else if (color === Color.NEITHER) {
				newGame();
			}
		} else if ((event.userID === opponentUserID && !myTurn) || color === Color.NEITHER) {
			//The other player tries to do something and it's their turn, or we're a spectator.
			if (messageType === MessageType.PLACE_PIECE) {
				//The other player tried to place a new piece onto the board.
				if (gamePhase === MessageType.PLACE_PIECE) {
					//And it's the right time in the game.
					let x = data.x;
					let y = data.y;
					if (boardState[x][y] === Color.NEITHER) {
						boardState[x][y] = data.color;
						if (color !== Color.NEITHER) {
							myTurn = true;
						}
					}
				}
			} else if (messageType === MessageType.MOVE_PIECE) {
				//The other player tried to move a piece already on the board.
				if (gamePhase === MessageType.MOVE_PIECE) {
					//And it's the right time in the game.
					let startX = data.startX;
					let startY = data.startY;
					let endX = data.endX;
					let endY = data.endY;
					let colorOfPiece = boardState[startX][startY];
					if (colorOfPiece !== color && colorOfPiece !== Color.NEITHER) {
						//They didn't try to move one of our pieces, and you can't begin a move from an empty space.
						if (boardState[endX][endY] === Color.NEITHER) {
							//The space the player moves their piece into must be empty to begin with.
							boardState[startX][startY] = Color.NEITHER;
							boardState[endX][endY] = colorOfPiece;
							if (color !== Color.NEITHER) {
								myTurn = true;
							}
						}
					}
				}
			}
		}
	});
}

function drawBoard() {
	canvas.beginPath();
	canvas.clearRect(0, 0, 800, 800);
	canvas.strokeRect(0, 0, squareSize * 2, squareSize * 2);
	canvas.beginPath();
	//Vertical middle line
	canvas.moveTo(squareSize, 0);
	canvas.lineTo(squareSize, squareSize * 2);
	//Horizontal middle line
	canvas.moveTo(0, squareSize);
	canvas.lineTo(squareSize * 2, squareSize);
	//Diagonal left-to-right line
	canvas.moveTo(0, 0);
	canvas.lineTo(squareSize * 2, squareSize * 2);
	//Diagonal right-to-left line
	canvas.moveTo(squareSize * 2, 0);
	canvas.lineTo(0, squareSize * 2);
	canvas.stroke();
	if (boardState !== undefined) {
		for (let i = 0; i < 3; i++) {
			for (let j = 0; j < 3; j++) {
				let pieceColor = boardState[i][j];
				if (pieceColor === Color.NEITHER) {
					continue;
				} else if (pieceColor === Color.WHITE) {
					canvas.fillStyle = 'PaleGoldenrod';
				} else {
					canvas.fillStyle = '#000044';
				}
				canvas.beginPath();
				canvas.arc(i * squareSize, j * squareSize, pieceRadius, 0, Math.PI * 2);
				canvas.fill();
			}
		}
	}
}

function findHitRegion(event) {
	let x = event.offsetX - boardPadding;
	let y = event.offsetY - boardPadding;
	let squareX = Math.round(x / squareSize);
	let squareY = Math.round(y / squareSize);
	let distance = Math.sqrt((x - squareX * squareSize)**2 + (y - squareY * squareSize)**2);
	if (!myTurn ||
		distance > pieceRadius ||
		(gamePhase === MessageType.PLACE_PIECE && boardState[squareX][squareY] !== Color.NEITHER)
	) {
		hitX = undefined;
		hitY = undefined;
		board.css('cursor', 'default');
	} else {
		hitX = squareX;
		hitY = squareY;
		board.css('cursor', 'pointer');
	}
}

board.on('mousemove', function (event) {
	findHitRegion(event);
});

board.on('click', function (event) {
	if (hitX !== undefined) {
		boardState[hitX][hitY] = color;
		myTurn = false;
		drawBoard();
		group.send(placePiece(hitX, hitY, color));
	}
});

function resizeBoard() {
	var width = board.width();
	board.attr('width', width);
	width = Math.floor(width);
	board.attr('height', width);
	board.height(width);
	boardPadding = Math.round(width / 6);
	squareSize = Math.round(width / 3);
	pieceRadius = Math.round(squareSize / 7);
	canvas.setTransform(1, 0, 0, 1, boardPadding, boardPadding);
	canvas.lineWidth = 2;
	drawBoard();
}

window.addEventListener('resize', resizeBoard);
resizeBoard();

function disconnected() {
	connected = false;
	connectButton.html('Connect');
	connectButton.addClass('btn-primary');
	connectButton.removeClass('btn-secondary');
	$('.login-detail').slideDown({easing: 'linear', duration: 2000});
}

connectButton.on('click', function (event) {
	alertArea.html('');

	if (connected) {
		event.preventDefault();
		group.disconnect();
		disconnected();
	} else {
		if (document.getElementById('login-form').checkValidity()) {
			event.preventDefault();
			initializeNetworking();
			connected = true;
			$('.login-detail').slideUp();
			connectButton.html('Disconnect');
			connectButton.addClass('btn-secondary');
			connectButton.removeClass('btn-primary');

			myUserID = $('#user-id').val();
			myUserID = myUserID.replace(/\s{2,}/g, ' ').replace(/\s$/, '');
			var sessionID = $('#session-id').val();
			if (sessionID === '') {
				sessionID = undefined;
			}
			group.connect(sessionID, myUserID);
			myUserID = escapeHTML(myUserID);
		}
	} // end if connected else not connected
});