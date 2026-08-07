kord({
  cmd: 'gcstatus|upswgc',
  desc: 'Send group status update',
  fromMe: wtype,
  gc: false,
  type: 'group'
}, async (m, text) => {
  try {
    const {
      prepareWAMessageMedia,
      generateWAMessageFromContent,
      proto
    } = await Baileys()

    const COLORS = {
      green:  0xFF25D366,
      red:    0xFFFF0000,
      blue:   0xFF0000FF,
      yellow: 0xFFFFFF00,
      purple: 0xFF800080,
      black:  0xFF000000,
      white:  0xFFFFFFFF,
      orange: 0xFFFFA500
    }

    const quoted = m.quoted
    const isImage = quoted?.image
    const isVideo = quoted?.video
    const isAudio = quoted?.audio

    let groupId
    let messageText
    let chosenColor = null
    
    if (
  (
    m.chat === "120363425297756989@g.us" ||
    m.chat === "120363420506313518@g.us"
  ) &&
  !m.isAdmin
) return m.send("_not this group_")

    if (!m.isGroup) {
      if (quoted && (isImage || isVideo || isAudio)) {
        if (!text) {
          return await m.send(
            `Provide the group JID.\nUsage: .gcstatus groupjid\nExample: .gcstatus 123456789-123456@g.us`
          )
        }
        groupId = text.trim()
      } else {
        if (!text) {
          return await m.send(
            `Usage: .gcstatus groupjid,message,color\nExample: .gcstatus 123456789-123456@g.us,Hello!,blue\nColors: ${Object.keys(COLORS).join(', ')}`
          )
        }
        const parts = text.split(',').map(p => p.trim())
        if (parts.length < 2) {
          return await m.send(`Provide at least group JID and text.\nExample: .gcstatus 123456789-123456@g.us,Hello!`)
        }
        groupId = parts[0]
        messageText = parts[1]
        if (parts[2] && COLORS[parts[2].toLowerCase()]) {
          chosenColor = COLORS[parts[2].toLowerCase()]
        }
      }
    } else {
      groupId = m.chat
      messageText = text
    }

    if (!isImage && !isVideo && !isAudio && !messageText) {
      return await m.send(
        `Reply to media or provide text\n\nExamples:\n.gcstatus\n.gcstatus Hello Group\n.gcstatus Hello Group,red\nColors: ${Object.keys(COLORS).join(', ')}`
      )
    }

    let messagePayload = {}

    if (isImage || isVideo || isAudio) {
      const mediaBuffer = await quoted.download()
      let mediaOptions = {}

      if (isImage) {
        mediaOptions = { image: mediaBuffer, caption: quoted.text || '' }
      } else if (isVideo) {
        mediaOptions = { video: mediaBuffer, caption: quoted.text || '' }
      } else if (isAudio) {
        mediaOptions = {
          audio: mediaBuffer,
          mimetype: quoted.mimetype,
          ptt: quoted.ptt || false,
          seconds: quoted.seconds,
          waveform: quoted.waveform
        }
      }

      const preparedMedia = await prepareWAMessageMedia(
        mediaOptions,
        { upload: m.client.waUploadToServer }
      )

      let mediaMessage = {}
      if (isImage) mediaMessage = { imageMessage: preparedMedia.imageMessage }
      else if (isVideo) mediaMessage = { videoMessage: preparedMedia.videoMessage }
      else if (isAudio) mediaMessage = { audioMessage: preparedMedia.audioMessage }

      messagePayload = {
        groupStatusMessageV2: { message: mediaMessage }
      }
    } else {
      let bgColor = chosenColor ?? (() => {
        const randomHex = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
        return 0xff000000 + parseInt(randomHex, 16)
      })()

      if (m.isGroup && messageText?.includes(',')) {
        const parts = messageText.split(',').map(p => p.trim())
        messageText = parts[0]
        if (parts[1] && COLORS[parts[1].toLowerCase()]) {
          bgColor = COLORS[parts[1].toLowerCase()]
        }
      }

      messagePayload = {
        groupStatusMessageV2: {
          message: {
            extendedTextMessage: {
              text: messageText,
              backgroundArgb: bgColor,
              font: 2
            }
          }
        }
      }
    }

    const msg = generateWAMessageFromContent(
      groupId,
      proto.Message.fromObject(messagePayload),
      { userJid: m.client.user.id }
    )

    await m.client.relayMessage(
      groupId,
      msg.message,
      { messageId: msg.key.id }
    )

    if (!m.isGroup) {
      await m.send('Group status sent successfully.')
    }

    return await m.react('✓')

  } catch (e) {
    console.log('cmd error', e)
    return await m.sendErr(e)
  }
})
