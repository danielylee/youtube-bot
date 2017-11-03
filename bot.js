const Discord = require('discord.js');
const logger = require('winston');
const ytdl = require('ytdl-core');
const request = require('request');
const fs = require('fs');
const getYoutubeID = require('get-youtube-id');
const fetchVideoInfo = require('youtube-info');

const bot = new Discord.Client();
var config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));

const YT_API_KEY = config.yt_api_key;
const BOT_CONTROLLER= config.bot_controller;
const PREFIX = config.prefix;
const TOKEN = config.discord_token;

var queue = [];
var queueNames = [];
var currentlyPlaying = false;
var dispatcher = null;
var voiceChannel = null;
var skipRequest = 0;
var skippers = [];

// Configure logger
logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, {
	colorize: true
});
logger.level = 'debug';

/* 
	Helper Functions
*/
function isYoutube(str) {
	return str.toLowerCase().indexOf('youtube.com') > -1;
}

function searchVideo(query, cb) {
	request('https://www.googleapis.com/youtube/v3/search?part=id&type=video&q=' + encodeURIComponent(query) + '&key=' + YT_API_KEY, (err, res, body) => {
		var json = JSON.parse(body);
		cb(json.items[0].id.videoId);
	});
}

// Avoids endless callbacks
function getID(str, cb) {
	if (isYoutube(str)) {
		cb(getYoutubeID(str));
	} else {
		searchVideo(str, (id) => {
			cb(id);
		});
	}
}

function addToQueue(strID) {
	if (isYoutube(strID)) {
		queue.push(getYoutubeID(strID));
	} else {
		queue.push(strID);
	}
}

function playMusic(id, message) {
	voiceChannel = message.member.voiceChannel;
	voiceChannel.join().then((connection) => {
		stream = ytdl('https://www.youtube.com/watch?v=' + id, {
			filter: 'audioonly'
		});

		skipRequest = 0;
		skippers = [];

		dispatcher = connection.playStream(stream);
		dispatcher.on('end', () => {
			skipRequest = 0;
			skippers = [];
			queue.shift();
			queueNames.shift();
			if (queue.length == 0) {
				queue = [];
				queueNames = [];
				currentlyPlaying = false;
			} else {
				setTimeout(() => {
					playMusic(queue[0], message);
				}, 500);
			}
		});
	});
}

function skipMusic(message) {
	dispatcher.end();
	if (queue.legnth > 1) {
		playMusic(queue[0].message);
	} else {
		skipRequest = 0;
		skippers = [];
	}
}


bot.on('ready', (event) => {
	logger.info('Connected');
});

bot.on('message', (message) => {
	const member = message.member;
	const mess = message.content.toLowerCase();
	const args = message.content.split(' ').slice(1).join(' ');

	if (mess.startsWith(PREFIX + 'play')) {
		if (message.member.voiceChannel || voiceChannel != null) {
			if (currentlyPlaying || queue.length > 0) {
				getID(args, (id) => {
					addToQueue(id);
					fetchVideoInfo(id, (err, videoInfo) => {
						if (err) throw new Error(err);
						message.reply(' Adding to queue: **' + videoInfo.title + '**');
						queueNames.push(videoInfo.title);
					});
				});
			} else {
				currentlyPlaying = true;
				getID(args, (id) => {
					// need to insert this since queue is empty
					queue.push(id);
					playMusic(id, message);
					fetchVideoInfo(id, (err, videoInfo) => {
						if (err) throw new Error(err);
						message.reply(' Now playing: **' + videoInfo.title + '**');
						queueNames.push(videoInfo.title);
					});
				});
			}
		} else {
			message.reply(' You need to be in a voice channel first');
		}
	} else if (mess.startsWith(PREFIX + 'skip')) {
		// check amount of users who skip and make sure they're already not in queue
		if (skippers.indexOf(message.author.id) == -1) {
			skippers.push(message.author.id);
			skipRequest++;
			if (skipRequest >= Math.ceil((voiceChannel.members.size - 1) / 2)) {
				skipMusic(message);
				message.reply(' Skipping song');
			} else {
				message.reply(' You need **' + Math.ceil((voiceChannel.members.size - 1) / 2) - skipRequest + '** more skip votes');
			}
		} else  {
			message.reply(' You already voted to skip!');
		}
	} else if (mess.startsWith(PREFIX + 'queue')) {
		const empty = '...'
		var _message = empty;
		for (var i = 0; i < queueNames.length; i++) {
			var temp = (i + 1) + ': ' + queueNames[i] + (i == 0 ? '**(current song)**' : '') + '\n';
			if ((_message + temp).length <= 2000 - 3) {
				_message += temp;
			} else {
				_message += empty;
				message.channel.send('_message');
				_message = empty;
			}
		}
		_message = empty;
		message.channel.send(_message);
	}
});

bot.login(TOKEN);




