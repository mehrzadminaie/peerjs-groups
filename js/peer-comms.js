"use strict";
/* TODO
 *	* Document code.
 *	* Connections between peers timing out?
 *	* Add method to disconnect from a session.
 *	* Handle calling connect twice.
 *	* When to disconnect (or destroy?) the peer.
 *	* Handle peer getting disconnected from peer server.
 *  * Handle when the peer named after the session goes down.
 *  * Ask for permission before accepting new peers.
 *	* Verify users' identities somehow (PGP signature?) 
 *  * Anonymize connection labels.
 */

function P2P(userID, onError, options) {
	var connections = new Map();
	var peersToUsers = new Map();
	var peer, sessionID;

	const me = this;

	const MsgType = {
		'DATA': 1,
		'PEER_LIST': 2,
		'IDENTIFY': 3,
	}

	function sessionEntered(id) {
		sessionID = id;
		var event = new jQuery.Event('connected', {
			sessionID: id
		});
		$(me).triggerHandler(event);
	}

	function connectTo(peerName) {
		var connection = peer.connect(peerName, {
			label: userID,
			metadata: {sessionID: sessionID},
			reliable: true
		});
		connection.on('data', dataReceived);
		connection.on('error', function (error) {
			if (error.type == 'peer-unavailable') {
				// Do nothing.
			} else if (onError) {
				onError(error);
			}
		});
		connection.on('open', function () {
			connections.set(peerName, connection);
		});

	}

	function getUserID(connection) {
		var label = connection.label;
		if (label === userID) {
			return peersToUsers.get(connection.peer);
		} else {
			return label;
		}
	}

	function send(message) {
		for (let connection of connections.values()) {
			connection.send(message);
		}
	};

	function sendIdentity(connection) {
		connection.send({
			type: MsgType.IDENTIFY,
			data: userID
		})
	}

	function dataReceived(message) {
		switch (message.type) {
		case MsgType.PEER_LIST:
			if (this.peer === sessionID) {
				for (let peerName of message.data) {
					connectTo(peerName);
				}
			}
			break;
		case MsgType.IDENTIFY:
			peersToUsers.set(this.peer, message.data);
			break;
		default:
			var event = new jQuery.Event('message', {
				sessionID: sessionID,
				userID: getUserID(this),
				message: message.data
			});
			$(me).triggerHandler(event);			
		}
	}

	function connectionAccepted(connection) {
		connection.on('data', dataReceived);
		connection.on('error', onError);
		connections.set(connection.peer, connection);
		sendIdentity(connection);

		var event = new jQuery.Event('userjoined', {
			sessionID: sessionID,
			userID: connection.label
		});
		$(me).triggerHandler(event);
	}

	function createSession () {
		peer = new Peer(sessionID, options);
		peer.on('error', function(error) {
			if (error.type == 'unavailable-id') {
				me.connect(sessionID);
			} else if (onError) {
				onError(error);
			}
		});

		peer.on('open', sessionEntered);

		peer.on('connection', function (connection) {
			connection.on('open', function () {
				if (connections.size > 0) {
					connection.send({
						type: MsgType.PEER_LIST,
						data: Array.from(connections.keys())
					});
				}
				connectionAccepted(connection);
			});
		});
	}

	this.connect = function(sessionIDToJoin) {
		var firstConnection;
		sessionID = sessionIDToJoin;

		if (sessionID) {

			if (peer === undefined || peer.disconnected) {
				peer = new Peer(options);
				peer.on('error', function (error) {
					if (error.type == 'peer-unavailable') {
						createSession(sessionID, onError);
					} else if (onError) {
						onError(error);
					}
				});

				peer.on('connection', function (connection) {
					connection.on('open', function () {
						if (connection.metadata.sessionID === sessionID) {
							connectionAccepted(connection);
						} else {
							connection.close();
						}
					});
				});
			}

			firstConnection = peer.connect(sessionID, {
				label: userID,
				reliable: true
			});

			firstConnection.on('data', dataReceived);
			firstConnection.on('error', onError);

			firstConnection.on('open', function () {
				connections.set(sessionID, firstConnection);
				sessionEntered(sessionID);
			});

		} else {

			createSession();

		}

	}; // end of connect method.

	this.send = function(data) {
		send({
			type: MsgType.DATA,
			data: data
		});
	}

	this.on = function(eventType, handler) {
		$(this).on(eventType, handler);
	}

}; // End of P2P function.
