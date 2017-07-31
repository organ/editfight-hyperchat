"use strict";

const log = require('./lib/log')
const { Party } = require('./lib/party')
const { Server } = require('./lib/server')
const uuid = require('uuid/v4');

const config = {
  port: 4000,
  origin: process.env.NODE_ORIGIN,
  pruneInterval: 30,
  charLimit: 256,
  allowedUpvoteTimes: 3,
  upvotesNeededToMoveUp: 3,
  differenceThreshold: 30,
  voteDelay: 30,
}

process.title = 'editfight-lines'

const party = new Party({
  maxConns: 3
})

const banned = []

const server = new Server({
  port: config.port,
  origin: config.origin,
  pruneInterval: config.pruneInterval,
  shouldAllow: (ip) => (banned.indexOf(ip) === -1) && party.canAdd(ip)
})




const lines = []


server.onopen = (ws) => {
  ws.hash = hashForString(uuid())
  ws.uuid = uuid()

  party.add(ws.ip)

  server.send(ws, {
    initial: lines,
    hash: ws.hash,
    uuid: ws.uuid,
    charLimit: config.charLimit,
  })

  const line = {
    hash: ws.hash,
    uuid: ws.uuid,
    text: '',
  }

  ws.line = line
  lines.push(line)
  server.sendToAll({ added: line })
}

server.onclose = (ws) => {
  party.remove(ws.ip)

  const i = lines.indexOf(ws.line)
  lines.splice(i, 1)
  server.sendToAll({ removed: i })
}

const maybeBan = {}

server.commands = {

  say(ws, text) {
    server.sendToAll({
      announcement: text
    })
  },

  text(ws, text) {
    text = text.substring(0, config.charLimit)
    ws.line.text = text
    server.sendToAll({ update: { uuid: ws.uuid, text } })
  },

  upvote(ws, uuid) {
    const now = (new Date()).getTime()
    if (ws.upvotedLast && now - ws.upvotedLast < (config.voteDelay * 1000))
      return
    ws.upvotedLast = now

    const i = lines.findIndex((line) => line.uuid === uuid)
    if (i > 0) {
      moveUp(i)
    }
  },

  autotop(ws, bla) {
    let oldIndex = lines.findIndex((line) => line.uuid === ws.uuid)
    if (oldIndex < 1) return

    const line = lines[oldIndex]
    line.autotop = true

    for (let i = oldIndex; i > 0; i--) {
      moveUp(i)
    }
  },

  ban(ws, uuid) {
    server.wss.clients.forEach((ws) => {
      if (ws.uuid === uuid) {
        banned.push(ws.ip)
        ws.terminate()
      }
    })
  },

}

function moveUp(oldIndex) {
  const newIndex = oldIndex - 1
  const line = lines[oldIndex]
  const tmpLine = lines[newIndex]

  if (tmpLine.autotop)
    return

  lines[newIndex] = line
  lines[oldIndex] = tmpLine
  server.sendToAll({ moved: oldIndex })
}

function hashForString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return hash
}

server.run()