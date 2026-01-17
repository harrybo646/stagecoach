const { createCanvas, registerFont, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const express = require('express');
const { Worker } = require('worker_threads');
const { once } = require('events');

const app = express();
const port = 80;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/videos', express.static(path.join(__dirname, 'videos')));

const jobStatus = new Map();

const SIZE_CONFIG = {
  originalWidth: 452,
  workingWidth: 702,
  workingHeight: 836,
  topExtension: 50,
  bottomExtension: 200,
  sideExtension: 200,
  borderWidth: 100,
  cornerRadius: 15,
  boxExtension: 125,
  baseBoxY: 496,
  boxHeight: 83,
  circleAreaWidth: 352,
  titleY: 363,
  titleHeight: 66,
  validY: 440,
  validHeight: 33,
  countdownY: 608,
  countdownHeight: 33,
  yourTicketBottomMargin: 20,
  greyBoxX: 148,
  greyBoxY: 904,
  greyBoxW: 405,
  greyBoxH: 33,
  greyBoxRadius: 17,
  ticketCodeX: 148,
  ticketCodeY: 907,
  ticketCodeW: 405,
  ticketCodeH: 28
};

const fontPath = path.join(__dirname, 'fonts', 'lineto-circular-medium.ttf');
if (fs.existsSync(fontPath)) {
  registerFont(fontPath, { family: 'Circular' });
  console.log('✓ Font registered');
} else {
  console.error('❌ Font file not found!');
  process.exit(1);
}

function rgbToYuvBT709(r, g, b) {
  const y = Math.round(16 + (0.2126 * r + 0.7152 * g + 0.0722 * b) * 219 / 255);
  const u = Math.round(128 + (-0.1146 * r - 0.3854 * g + 0.5 * b) * 224 / 255);
  const v = Math.round(128 + (0.5 * r - 0.4542 * g - 0.0458 * b) * 224 / 255);
  return {
    y: Math.max(16, Math.min(235, y)),
    u: Math.max(16, Math.min(240, u)),
    v: Math.max(16, Math.min(240, v))
  };
}

class SeededRandom {
  constructor(seed) { this.seed = seed; }
  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

async function generateVideo(routeText, videoId, expectedTime, callback) {
  const { originalWidth, workingWidth, workingHeight, boxExtension, topExtension, bottomExtension, sideExtension,
    baseBoxY, boxHeight, circleAreaWidth, borderWidth, cornerRadius, yourTicketBottomMargin,
    titleY, titleHeight, validY, validHeight, countdownY, countdownHeight,
    greyBoxX, greyBoxY, greyBoxW, greyBoxH, greyBoxRadius, ticketCodeX, ticketCodeY, ticketCodeW, ticketCodeH
  } = SIZE_CONFIG;
  
  const workingCanvas = createCanvas(workingWidth, workingHeight);
  const workingCtx = workingCanvas.getContext('2d');
  const fps = 30, videoDurationSeconds = 30, totalFrames = videoDurationSeconds * fps;
  const countdownStartSeconds = 57 * 60 + 59, animationAmplitude = 12, animationSpeed = 0.08;

  const randomWords = ['Adventure', 'Beautiful', 'Courage', 'Destiny', 'Elegant', 'Freedom', 'Gratitude',
    'Harmony', 'Inspire', 'Journey', 'Knowledge', 'Liberty', 'Majestic', 'Noble', 'Opportunity', 'Passion',
    'Quality', 'Resilience', 'Serenity', 'Triumph', 'Unity', 'Victory', 'Wisdom', 'Zenith', 'Abundance',
    'Blissful', 'Captivate', 'Delightful', 'Energetic', 'Flourish', 'Graceful', 'Hopeful', 'Illuminate',
    'Joyful', 'Kindness', 'Laughter', 'Magnificent', 'Nurture', 'Optimism', 'Peaceful', 'Radiant',
    'Strength', 'Tranquil', 'Vibrant', 'Wonderful'];

  const rng = new SeededRandom(videoId.split('').reduce((a, b) => a + b.charCodeAt(0), 0));
  const selectedWord = randomWords[Math.floor(rng.next() * randomWords.length)];
  const generationStartTime = new Date();

  const circles = [], numCircles = 10, circleAreaStart = (workingWidth - circleAreaWidth) / 2;
  for (let i = 0; i < numCircles; i++) {
    circles.push({
      x: circleAreaStart + rng.next() * circleAreaWidth, y: baseBoxY + rng.next() * boxHeight,
      radius: 10 + rng.next() * 30, vx: (rng.next() - 0.5) * 3, vy: (rng.next() - 0.5) * 3,
      alpha: 0.1 + rng.next() * 0.15
    });
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' '), lines = [];
    let line = '';
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      if (ctx.measureText(testLine).width > maxWidth && n > 0) {
        lines.push(line);
        line = words[n] + ' ';
      } else line = testLine;
    }
    lines.push(line);
    let yPos = y - (lines.length * lineHeight / 2) + (lineHeight / 2);
    lines.forEach(lineText => {
      ctx.fillText(lineText.trim(), x, yPos);
      yPos += lineHeight;
    });
  }

  try {
    const templateImage = await loadImage(path.join(__dirname, 'template.png'));
    const templateWidth = templateImage.width, templateHeight = templateImage.height;
    const adjustedHeight = templateHeight + topExtension + bottomExtension;
    const adjustedWidth = templateWidth + (sideExtension * 2);
    
    const outputCanvas = createCanvas(adjustedWidth, adjustedHeight);
    const outputCtx = outputCanvas.getContext('2d');
    
    const cachedWorkingCanvas = createCanvas(workingWidth, workingHeight);
    const cachedWorkingCtx = cachedWorkingCanvas.getContext('2d');
    
    cachedWorkingCtx.font = '30px "Circular", sans-serif';
    cachedWorkingCtx.textAlign = 'center';
    cachedWorkingCtx.textBaseline = 'middle';
    cachedWorkingCtx.fillStyle = '#000';
    const titleCenterX = boxExtension + originalWidth / 2;
    const titleCenterY = titleY + titleHeight / 2;
    const titleMaxWidth = originalWidth - 102;
    wrapText(cachedWorkingCtx, routeText, titleCenterX, titleCenterY, titleMaxWidth, 36);
    
    cachedWorkingCtx.font = '18px "Circular", sans-serif';
    const now = new Date();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'];
    const validText = `Valid from: ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}, ${String(now.getDate()).padStart(2,'0')} ${months[now.getMonth()]} ${now.getFullYear()}`;
    cachedWorkingCtx.fillText(validText, boxExtension + originalWidth / 2, validY + validHeight / 2);

    const videosDir = path.join(__dirname, 'videos');
    if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir);
    const outputPath = path.join(videosDir, `${videoId}.mp4`);

    const ffmpegProcess = spawn(ffmpegPath, [
      '-y', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_range', 'tv',
      '-s', `${adjustedWidth}x${adjustedHeight}`, '-framerate', String(fps), '-i', '-',
      '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p',
      '-colorspace', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', '-preset', 'ultrafast', outputPath
    ]);
    
    let errorOutput = '';
    ffmpegProcess.stderr.on('data', (data) => { errorOutput += data.toString(); });

    const yPlaneSize = adjustedWidth * adjustedHeight;
    const uvPlaneSize = (adjustedWidth / 2) * (adjustedHeight / 2);
    const yuvBufferSize = yPlaneSize + uvPlaneSize * 2;
    const staticYUVBuffer = Buffer.alloc(yuvBufferSize);
    
    outputCtx.clearRect(0, 0, adjustedWidth, adjustedHeight);
    outputCtx.drawImage(templateImage, 0, 0, templateWidth, templateHeight, sideExtension, topExtension, templateWidth, templateHeight);
    
    const templateRGBA = outputCanvas.toBuffer('raw');
    
    for (let y = 0; y < adjustedHeight; y++) {
      for (let x = 0; x < adjustedWidth; x++) {
        const rgbaIndex = (y * adjustedWidth + x) * 4;
        const yuv = rgbToYuvBT709(templateRGBA[rgbaIndex], templateRGBA[rgbaIndex + 1], templateRGBA[rgbaIndex + 2]);
        staticYUVBuffer[y * adjustedWidth + x] = yuv.y;
        if (y % 2 === 0 && x % 2 === 0) {
          const uvIndex = (y / 2) * (adjustedWidth / 2) + (x / 2);
          staticYUVBuffer[yPlaneSize + uvIndex] = yuv.u;
          staticYUVBuffer[yPlaneSize + uvPlaneSize + uvIndex] = yuv.v;
        }
      }
    }

    let frameCount = 0;
    const startTime = Date.now();
    jobStatus.set(videoId, { status: 'processing', progress: 0 });

    for (let i = 0; i < totalFrames; i++) {
      workingCtx.clearRect(0, 0, workingWidth, workingHeight);
      workingCtx.drawImage(cachedWorkingCanvas, 0, 0);

      const currentSecond = i / fps;
      const secondsLeft = Math.max(0, countdownStartSeconds - Math.floor(currentSecond));
      const minutes = Math.floor(secondsLeft / 60), seconds = secondsLeft % 60;

      const estimatedTime = new Date(generationStartTime.getTime() + (currentSecond * 1000));
      const estimatedTimeString = expectedTime || `${String(estimatedTime.getHours()).padStart(2, '0')}:${String(estimatedTime.getMinutes()).padStart(2, '0')}`;

      const cycleDuration = 1 / animationSpeed, halfCycle = cycleDuration / 2;
      const cyclePosition = currentSecond % cycleDuration;
      let tlPull = 0, trPull = 0;
      
      if (cyclePosition < halfCycle) tlPull = Math.sin((cyclePosition / halfCycle) * Math.PI) * animationAmplitude;
      else trPull = Math.sin(((cyclePosition - halfCycle) / halfCycle) * Math.PI) * animationAmplitude;

      const avgTopY = baseBoxY + (tlPull + trPull) / 2;

      workingCtx.shadowColor = 'rgba(0, 0, 0, 0.15)';
      workingCtx.shadowBlur = 10;
      workingCtx.shadowOffsetX = 0;
      workingCtx.shadowOffsetY = 4;
      workingCtx.fillStyle = '#D9D9D9';
      workingCtx.beginPath();
      workingCtx.moveTo(0, baseBoxY + tlPull);
      workingCtx.lineTo(workingWidth, baseBoxY + trPull);
      workingCtx.lineTo(workingWidth, baseBoxY + boxHeight + trPull);
      workingCtx.lineTo(0, baseBoxY + boxHeight + tlPull);
      workingCtx.closePath();
      workingCtx.fill();

      workingCtx.shadowColor = 'transparent';
      workingCtx.shadowBlur = 0;
      workingCtx.shadowOffsetX = 0;
      workingCtx.shadowOffsetY = 0;

      workingCtx.save();
      workingCtx.beginPath();
      workingCtx.moveTo(circleAreaStart, baseBoxY + tlPull);
      workingCtx.lineTo(circleAreaStart + circleAreaWidth, baseBoxY + trPull);
      workingCtx.lineTo(circleAreaStart + circleAreaWidth, baseBoxY + boxHeight + trPull);
      workingCtx.lineTo(circleAreaStart, baseBoxY + boxHeight + tlPull);
      workingCtx.closePath();
      workingCtx.clip();

      circles.forEach(circle => {
        circle.x += circle.vx;
        circle.y += circle.vy;
        if (circle.x < circleAreaStart - circle.radius) circle.x = circleAreaStart + circleAreaWidth + circle.radius;
        if (circle.x > circleAreaStart + circleAreaWidth + circle.radius) circle.x = circleAreaStart - circle.radius;
        if (circle.y < baseBoxY - circle.radius) circle.y = baseBoxY + boxHeight + circle.radius;
        if (circle.y > baseBoxY + boxHeight + circle.radius) circle.y = baseBoxY - circle.radius;
        workingCtx.fillStyle = `rgba(100, 100, 100, ${circle.alpha})`;
        workingCtx.beginPath();
        workingCtx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
        workingCtx.fill();
      });
      workingCtx.restore();

      const switchCycle = 2, cycleTime = currentSecond % (switchCycle * 2), fadeDuration = 0.3;
      let textToShow, textOpacity = 1;
      
      if (cycleTime < switchCycle) {
        textToShow = selectedWord;
        if (cycleTime > switchCycle - fadeDuration) textOpacity = (switchCycle - cycleTime) / fadeDuration;
      } else {
        textToShow = estimatedTimeString;
        if (cycleTime < switchCycle + fadeDuration) textOpacity = (cycleTime - switchCycle) / fadeDuration;
        if (cycleTime > (switchCycle * 2) - fadeDuration) textOpacity = ((switchCycle * 2) - cycleTime) / fadeDuration;
      }

      workingCtx.font = '40px "Circular", sans-serif';
      workingCtx.fillStyle = `rgba(0, 0, 0, ${textOpacity})`;
      workingCtx.textAlign = 'center';
      workingCtx.textBaseline = 'middle';
      const wordCenterX = workingWidth / 2;
      const textRelativeY = 63 / 2;
      const wordCenterY = avgTopY + 10 + textRelativeY;
      const wordMaxWidth = originalWidth - 102;
      wrapText(workingCtx, textToShow, wordCenterX, wordCenterY, wordMaxWidth, 48);

      workingCtx.font = '18px "Circular", sans-serif';
      workingCtx.fillStyle = '#000';
      workingCtx.textAlign = 'center';
      const countdownText = `Ticket expires in: 0h: ${minutes}m: ${seconds}s`;
      workingCtx.fillText(countdownText, workingWidth / 2, countdownY + countdownHeight / 2);

      outputCtx.clearRect(0, 0, adjustedWidth, adjustedHeight);
      outputCtx.drawImage(templateImage, 0, 0, templateWidth, templateHeight, sideExtension, topExtension, templateWidth, templateHeight);
      outputCtx.drawImage(workingCanvas, sideExtension, 224 + topExtension);

      const yuvBuffer = Buffer.from(staticYUVBuffer);
      const rgbaBuffer = outputCanvas.toBuffer('raw');
      const animatedStartY = 224 + topExtension, animatedEndY = 224 + topExtension + workingHeight;
      
      for (let y = animatedStartY; y < animatedEndY && y < adjustedHeight; y++) {
        for (let x = 0; x < adjustedWidth; x++) {
          const i = (y * adjustedWidth + x) * 4;
          const yuv = rgbToYuvBT709(rgbaBuffer[i], rgbaBuffer[i+1], rgbaBuffer[i+2]);
          yuvBuffer[y * adjustedWidth + x] = yuv.y;
          if (y % 2 === 0 && x % 2 === 0) {
            const uvIdx = (y / 2) * (adjustedWidth / 2) + (x / 2);
            yuvBuffer[yPlaneSize + uvIdx] = yuv.u;
            yuvBuffer[yPlaneSize + uvPlaneSize + uvIdx] = yuv.v;
          }
        }
      }

      const topBorderExtra = 115 + topExtension, bottomBorderReduction = 10 - bottomExtension;
      const borderColor = rgbToYuvBT709(19, 32, 42);
      const r2 = cornerRadius * cornerRadius;
      const cardX = borderWidth, cardY = borderWidth + topBorderExtra;
      const cardW = templateWidth - borderWidth * 2, cardH = adjustedHeight - borderWidth * 2 - topBorderExtra + bottomBorderReduction;

      for (let y = 0; y < adjustedHeight; y++) {
        for (let x = 0; x < adjustedWidth; x++) {
          let insideCard = false;
          const adjustedCardX = cardX + sideExtension;

          if (x >= adjustedCardX + cornerRadius && x < adjustedCardX + cardW - cornerRadius && y >= cardY && y < cardY + cardH) insideCard = true;
          if (x >= adjustedCardX && x < adjustedCardX + cardW && y >= cardY + cornerRadius && y < cardY + cardH - cornerRadius) insideCard = true;

          if (x < adjustedCardX + cornerRadius && y < cardY + cornerRadius) {
            if ((x - (adjustedCardX + cornerRadius)) ** 2 + (y - (cardY + cornerRadius)) ** 2 <= r2) insideCard = true;
          }
          if (x >= adjustedCardX + cardW - cornerRadius && y < cardY + cornerRadius) {
            if ((x - (adjustedCardX + cardW - cornerRadius - 1)) ** 2 + (y - (cardY + cornerRadius)) ** 2 <= r2) insideCard = true;
          }
          if (x < adjustedCardX + cornerRadius && y >= cardY + cardH - cornerRadius) {
            if ((x - (adjustedCardX + cornerRadius)) ** 2 + (y - (cardY + cardH - cornerRadius - 1)) ** 2 <= r2) insideCard = true;
          }
          if (x >= adjustedCardX + cardW - cornerRadius && y >= cardY + cardH - cornerRadius) {
            if ((x - (adjustedCardX + cardW - cornerRadius - 1)) ** 2 + (y - (cardY + cardH - cornerRadius - 1)) ** 2 <= r2) insideCard = true;
          }

          if (!insideCard) {
            yuvBuffer[y * adjustedWidth + x] = borderColor.y;
            if ((y & 1) === 0 && (x & 1) === 0) {
              const uvIdx = (y >> 1) * (adjustedWidth >> 1) + (x >> 1);
              yuvBuffer[yPlaneSize + uvIdx] = borderColor.u;
              yuvBuffer[yPlaneSize + uvPlaneSize + uvIdx] = borderColor.v;
            }
          }
        }
      }

      const tempCanvas = createCanvas(124, 27);
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.fillStyle = '#FFF';
      tempCtx.font = '25px "Circular", sans-serif';
      tempCtx.textAlign = 'center';
      tempCtx.textBaseline = 'middle';
      tempCtx.fillText('Your ticket', 62, 13.5);
      
      const textWidth = 124, textHeight = 27;
      const textStartX = Math.floor((adjustedWidth - textWidth) / 2);
      const textStartY = cardY - yourTicketBottomMargin - textHeight;
      const textRGBA = tempCanvas.toBuffer('raw');
      
      for (let ty = 0; ty < textHeight; ty++) {
        for (let tx = 0; tx < textWidth; tx++) {
          if (textRGBA[(ty * textWidth + tx) * 4 + 3] > 128) {
            const i = (ty * textWidth + tx) * 4;
            const yuv = rgbToYuvBT709(textRGBA[i], textRGBA[i+1], textRGBA[i+2]);
            const finalY = textStartY + ty, finalX = textStartX + tx;
            if (finalY >= 0 && finalY < adjustedHeight && finalX >= 0 && finalX < adjustedWidth) {
              yuvBuffer[finalY * adjustedWidth + finalX] = yuv.y;
              if ((finalY & 1) === 0 && (finalX & 1) === 0) {
                const uvIdx = (finalY >> 1) * (adjustedWidth >> 1) + (finalX >> 1);
                yuvBuffer[yPlaneSize + uvIdx] = yuv.u;
                yuvBuffer[yPlaneSize + uvPlaneSize + uvIdx] = yuv.v;
              }
            }
          }
        }
      }

      // ADD GREY BOX WITH TICKET CODE
      const greyBoxRealX = greyBoxX + sideExtension;
      const greyBoxRealY = greyBoxY + topExtension;
      const r2Grey = greyBoxRadius * greyBoxRadius;
      const greyBoxColor = rgbToYuvBT709(233, 219, 219);

      for (let y = greyBoxRealY; y < greyBoxRealY + greyBoxH && y < adjustedHeight; y++) {
        for (let x = greyBoxRealX; x < greyBoxRealX + greyBoxW && x < adjustedWidth; x++) {
          let insideBox = false;

          if (x >= greyBoxRealX + greyBoxRadius && x < greyBoxRealX + greyBoxW - greyBoxRadius &&
              y >= greyBoxRealY && y < greyBoxRealY + greyBoxH) insideBox = true;
          if (x >= greyBoxRealX && x < greyBoxRealX + greyBoxW &&
              y >= greyBoxRealY + greyBoxRadius && y < greyBoxRealY + greyBoxH - greyBoxRadius) insideBox = true;

          if (x < greyBoxRealX + greyBoxRadius && y < greyBoxRealY + greyBoxRadius) {
            if ((x - (greyBoxRealX + greyBoxRadius)) ** 2 + (y - (greyBoxRealY + greyBoxRadius)) ** 2 <= r2Grey) insideBox = true;
          }
          if (x >= greyBoxRealX + greyBoxW - greyBoxRadius && y < greyBoxRealY + greyBoxRadius) {
            if ((x - (greyBoxRealX + greyBoxW - greyBoxRadius - 1)) ** 2 + (y - (greyBoxRealY + greyBoxRadius)) ** 2 <= r2Grey) insideBox = true;
          }
          if (x < greyBoxRealX + greyBoxRadius && y >= greyBoxRealY + greyBoxH - greyBoxRadius) {
            if ((x - (greyBoxRealX + greyBoxRadius)) ** 2 + (y - (greyBoxRealY + greyBoxH - greyBoxRadius - 1)) ** 2 <= r2Grey) insideBox = true;
          }
          if (x >= greyBoxRealX + greyBoxW - greyBoxRadius && y >= greyBoxRealY + greyBoxH - greyBoxRadius) {
            if ((x - (greyBoxRealX + greyBoxW - greyBoxRadius - 1)) ** 2 + (y - (greyBoxRealY + greyBoxH - greyBoxRadius - 1)) ** 2 <= r2Grey) insideBox = true;
          }

          if (insideBox) {
            yuvBuffer[y * adjustedWidth + x] = greyBoxColor.y;
            if ((y & 1) === 0 && (x & 1) === 0) {
              const uvIdx = (y >> 1) * (adjustedWidth >> 1) + (x >> 1);
              yuvBuffer[yPlaneSize + uvIdx] = greyBoxColor.u;
              yuvBuffer[yPlaneSize + uvPlaneSize + uvIdx] = greyBoxColor.v;
            }
          }
        }
      }

      const ticketCodeCanvas = createCanvas(ticketCodeW, ticketCodeH);
      const ticketCodeCtx = ticketCodeCanvas.getContext('2d');
      ticketCodeCtx.fillStyle = '#000';
      ticketCodeCtx.font = '13px "Circular", sans-serif';
      ticketCodeCtx.textAlign = 'center';
      ticketCodeCtx.textBaseline = 'middle';
      ticketCodeCtx.fillText('48291-2026010716553485256833-bgfHT', ticketCodeW / 2, ticketCodeH / 2);
      
      const ticketCodeRealX = ticketCodeX + sideExtension;
      const ticketCodeRealY = ticketCodeY + topExtension;
      const ticketCodeRGBA = ticketCodeCanvas.toBuffer('raw');
      
      for (let ty = 0; ty < ticketCodeH; ty++) {
        for (let tx = 0; tx < ticketCodeW; tx++) {
          if (ticketCodeRGBA[(ty * ticketCodeW + tx) * 4 + 3] > 128) {
            const i = (ty * ticketCodeW + tx) * 4;
            const yuv = rgbToYuvBT709(ticketCodeRGBA[i], ticketCodeRGBA[i+1], ticketCodeRGBA[i+2]);
            const finalY = ticketCodeRealY + ty, finalX = ticketCodeRealX + tx;
            if (finalY >= 0 && finalY < adjustedHeight && finalX >= 0 && finalX < adjustedWidth) {
              yuvBuffer[finalY * adjustedWidth + finalX] = yuv.y;
              if ((finalY & 1) === 0 && (finalX & 1) === 0) {
                const uvIdx = (finalY >> 1) * (adjustedWidth >> 1) + (finalX >> 1);
                yuvBuffer[yPlaneSize + uvIdx] = yuv.u;
                yuvBuffer[yPlaneSize + uvPlaneSize + uvIdx] = yuv.v;
              }
            }
          }
        }
      }

      // ADD "MORE DETAILS >" TEXT BOX
      const moreDetailsCanvas = createCanvas(119, 33);
      const moreDetailsCtx = moreDetailsCanvas.getContext('2d');
      moreDetailsCtx.fillStyle = 'rgb(42, 124, 74)';
      moreDetailsCtx.font = '13px "Circular", sans-serif';
      moreDetailsCtx.textAlign = 'center';
      moreDetailsCtx.textBaseline = 'middle';
      moreDetailsCtx.fillText('More details >', 119 / 2, 33 / 2);

      const moreDetailsW = 119, moreDetailsH = 33;
      const moreDetailsRealX = 291 + sideExtension;
      const moreDetailsRealY = 976 + topExtension;
      const moreDetailsRGBA = moreDetailsCanvas.toBuffer('raw');
      const moreDetailsColor = rgbToYuvBT709(42, 124, 74);

      for (let ty = 0; ty < moreDetailsH; ty++) {
        for (let tx = 0; tx < moreDetailsW; tx++) {
          if (moreDetailsRGBA[(ty * moreDetailsW + tx) * 4 + 3] > 128) {
            const i = (ty * moreDetailsW + tx) * 4;
            const yuv = rgbToYuvBT709(moreDetailsRGBA[i], moreDetailsRGBA[i+1], moreDetailsRGBA[i+2]);
            const finalY = moreDetailsRealY + ty, finalX = moreDetailsRealX + tx;
            if (finalY >= 0 && finalY < adjustedHeight && finalX >= 0 && finalX < adjustedWidth) {
              yuvBuffer[finalY * adjustedWidth + finalX] = yuv.y;
              if ((finalY & 1) === 0 && (finalX & 1) === 0) {
                const uvIdx = (finalY >> 1) * (adjustedWidth >> 1) + (finalX >> 1);
                yuvBuffer[yPlaneSize + uvIdx] = yuv.u;
                yuvBuffer[yPlaneSize + uvPlaneSize + uvIdx] = yuv.v;
              }
            }
          }
        }
      }

      ////////

        // ADD DARK BOX WITH PRICING TEXT (CLIPPED TO CARD BOUNDARY)
        const pricingBoxX = 0;
        const pricingBoxY = 231;
        const pricingBoxW = 539;
        const pricingBoxH = 66;
        const pricingBoxRadius = 17;
        const pricingBoxRealX = pricingBoxX + sideExtension;
        const pricingBoxRealY = pricingBoxY + topExtension;
        const r2Pricing = pricingBoxRadius * pricingBoxRadius;
        const pricingBoxColor = rgbToYuvBT709(13, 22, 29);

        for (let y = pricingBoxRealY; y < pricingBoxRealY + pricingBoxH && y < adjustedHeight; y++) {
          for (let x = pricingBoxRealX; x < pricingBoxRealX + pricingBoxW && x < adjustedWidth; x++) {
            let insideBox = false;

            // Main rectangular area (no left corners rounded)
            if (x >= pricingBoxRealX && x < pricingBoxRealX + pricingBoxW - pricingBoxRadius &&
                y >= pricingBoxRealY && y < pricingBoxRealY + pricingBoxH) insideBox = true;
            if (x >= pricingBoxRealX && x < pricingBoxRealX + pricingBoxW &&
                y >= pricingBoxRealY + pricingBoxRadius && y < pricingBoxRealY + pricingBoxH - pricingBoxRadius) insideBox = true;

            // Top-right rounded corner
            if (x >= pricingBoxRealX + pricingBoxW - pricingBoxRadius && y < pricingBoxRealY + pricingBoxRadius) {
              if ((x - (pricingBoxRealX + pricingBoxW - pricingBoxRadius - 1)) ** 2 + (y - (pricingBoxRealY + pricingBoxRadius)) ** 2 <= r2Pricing) insideBox = true;
            }
            // Bottom-right rounded corner
            if (x >= pricingBoxRealX + pricingBoxW - pricingBoxRadius && y >= pricingBoxRealY + pricingBoxH - pricingBoxRadius) {
              if ((x - (pricingBoxRealX + pricingBoxW - pricingBoxRadius - 1)) ** 2 + (y - (pricingBoxRealY + pricingBoxH - pricingBoxRadius - 1)) ** 2 <= r2Pricing) insideBox = true;
            }

            if (insideBox) {
              // Check if this pixel is inside the card boundary
              let insideCard = false;
              const adjustedCardX = cardX + sideExtension;

              if (x >= adjustedCardX + cornerRadius && x < adjustedCardX + cardW - cornerRadius && y >= cardY && y < cardY + cardH) insideCard = true;
              if (x >= adjustedCardX && x < adjustedCardX + cardW && y >= cardY + cornerRadius && y < cardY + cardH - cornerRadius) insideCard = true;

              if (x < adjustedCardX + cornerRadius && y < cardY + cornerRadius) {
                if ((x - (adjustedCardX + cornerRadius)) ** 2 + (y - (cardY + cornerRadius)) ** 2 <= r2) insideCard = true;
              }
              if (x >= adjustedCardX + cardW - cornerRadius && y < cardY + cornerRadius) {
                if ((x - (adjustedCardX + cardW - cornerRadius - 1)) ** 2 + (y - (cardY + cornerRadius)) ** 2 <= r2) insideCard = true;
              }
              if (x < adjustedCardX + cornerRadius && y >= cardY + cardH - cornerRadius) {
                if ((x - (adjustedCardX + cornerRadius)) ** 2 + (y - (cardY + cardH - cornerRadius - 1)) ** 2 <= r2) insideCard = true;
              }
              if (x >= adjustedCardX + cardW - cornerRadius && y >= cardY + cardH - cornerRadius) {
                if ((x - (adjustedCardX + cardW - cornerRadius - 1)) ** 2 + (y - (cardY + cardH - cornerRadius - 1)) ** 2 <= r2) insideCard = true;
              }

              // Only draw the pricing box if we're inside the card
              if (insideCard) {
                yuvBuffer[y * adjustedWidth + x] = pricingBoxColor.y;
                if ((y & 1) === 0 && (x & 1) === 0) {
                  const uvIdx = (y >> 1) * (adjustedWidth >> 1) + (x >> 1);
                  yuvBuffer[yPlaneSize + uvIdx] = pricingBoxColor.u;
                  yuvBuffer[yPlaneSize + uvPlaneSize + uvIdx] = pricingBoxColor.v;
                }
              }
            }
          }
        }

        // ADD PRICING TEXT INSIDE BOX
        const pricingTextCanvas = createCanvas(378, 33);
        const pricingTextCtx = pricingTextCanvas.getContext('2d');
        pricingTextCtx.fillStyle = '#FFF';
        pricingTextCtx.font = '28px "Circular", sans-serif';
        pricingTextCtx.textAlign = 'left';
        pricingTextCtx.textBaseline = 'middle';
        pricingTextCtx.fillText('1 Adult                               £3.00', 0, 33 / 2);

        const pricingTextW = 378, pricingTextH = 33;
        const pricingTextRealX = 126 + sideExtension;
        const pricingTextRealY = 248 + topExtension;
        const pricingTextRGBA = pricingTextCanvas.toBuffer('raw');

        for (let ty = 0; ty < pricingTextH; ty++) {
          for (let tx = 0; tx < pricingTextW; tx++) {
            if (pricingTextRGBA[(ty * pricingTextW + tx) * 4 + 3] > 128) {
              const i = (ty * pricingTextW + tx) * 4;
              const yuv = rgbToYuvBT709(pricingTextRGBA[i], pricingTextRGBA[i+1], pricingTextRGBA[i+2]);
              const finalY = pricingTextRealY + ty, finalX = pricingTextRealX + tx;
              if (finalY >= 0 && finalY < adjustedHeight && finalX >= 0 && finalX < adjustedWidth) {
                yuvBuffer[finalY * adjustedWidth + finalX] = yuv.y;
                if ((finalY & 1) === 0 && (finalX & 1) === 0) {
                  const uvIdx = (finalY >> 1) * (adjustedWidth >> 1) + (finalX >> 1);
                  yuvBuffer[yPlaneSize + uvIdx] = yuv.u;
                  yuvBuffer[yPlaneSize + uvPlaneSize + uvIdx] = yuv.v;
                }
              }
            }
          }
        }

      ////////

      if (!ffmpegProcess.stdin.write(yuvBuffer)) await once(ffmpegProcess.stdin, 'drain');

      frameCount++;
      jobStatus.set(videoId, { status: 'processing', progress: Math.round((frameCount / totalFrames) * 100) });
      
      if (frameCount % 150 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  Progress: ${frameCount}/${totalFrames} frames (${(frameCount / elapsed).toFixed(1)} fps)`);
      }
    }

    ffmpegProcess.stdin.end();

    ffmpegProcess.on('close', code => {
      if (code === 0) {
        console.log(`  ✓ Completed in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
        jobStatus.set(videoId, { status: 'complete', progress: 100 });
        callback(null, videoId);
      } else {
        console.error('FFmpeg error:', errorOutput);
        jobStatus.set(videoId, { status: 'error', error: errorOutput });
        callback(new Error('FFmpeg failed with code ' + code));
      }
    });

    ffmpegProcess.on('error', (err) => {
      jobStatus.set(videoId, { status: 'error', error: err.message });
      callback(err);
    });

  } catch (err) {
    jobStatus.set(videoId, { status: 'error', error: err.message });
    callback(err);
  }
}

function cleanupOldVideos() {
  const videosDir = path.join(__dirname, 'videos');
  if (!fs.existsSync(videosDir)) return;
  const now = Date.now(), maxAge = 60 * 60 * 1000;
  fs.readdir(videosDir, (err, files) => {
    if (err) return;
    files.forEach(file => {
      const filePath = path.join(videosDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        if (now - stats.mtimeMs > maxAge) fs.unlink(filePath, () => console.log(`🗑️  Cleaned up: ${file}`));
      });
    });
  });
}

setInterval(cleanupOldVideos, 15 * 60 * 1000);

// ---------------------------
// ROUTES
// ---------------------------

app.get('/generate', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bus Ticket Generator (Optimized)</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 600px;
          margin: 50px auto;
          padding: 20px;
        }
        input {
          width: 100%;
          padding: 10px;
          margin: 10px 0;
          font-size: 16px;
          box-sizing: border-box;
        }
        button {
          width: 100%;
          padding: 15px;
          background: #007bff;
          color: white;
          border: none;
          font-size: 18px;
          cursor: pointer;
          margin-top: 10px;
        }
        button:hover {
          background: #0056b3;
        }
        button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        #result {
          margin-top: 30px;
        }
        video {
          width: 100%;
          margin-top: 20px;
        }
        .loading {
          text-align: center;
          color: #666;
        }
        .info {
          background: #d4edda;
          padding: 15px;
          margin: 20px 0;
          border-left: 4px solid #28a745;
        }
        .progress-bar {
          width: 100%;
          height: 30px;
          background: #f0f0f0;
          border-radius: 5px;
          overflow: hidden;
          margin-top: 15px;
        }
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #007bff, #0056b3);
          transition: width 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <h1>Bus Ticket Generator</h1>
      <div class="info">
        ✅ Current solution
      </div>
      <form id="generateForm">
        <input type="text" id="from" name="from" placeholder="From" required>
        <input type="text" id="to" name="to" placeholder="To" required>
        <input type="time" id="expectedTime" name="expectedTime" placeholder="Expected Time (optional)">
        <button type="submit">Generate</button>
      </form>
      <div id="result"></div>

      <script>
        let statusCheckInterval = null;
        
        async function checkStatus(videoId) {
          try {
            const response = await fetch('/status/' + videoId);
            const data = await response.json();
            
            if (data.status === 'processing') {
              document.getElementById('result').innerHTML = \`
                <p class="loading">Generating video...</p>
                <div class="progress-bar">
                  <div class="progress-fill" style="width: \${data.progress}%">\${data.progress}%</div>
                </div>
              \`;
            } else if (data.status === 'complete') {
              clearInterval(statusCheckInterval);
              document.getElementById('result').innerHTML = \`
                <h2>✓ Video Ready!</h2>
                <video controls autoplay>
                  <source src="/videos/\${videoId}.mp4" type="video/mp4">
                </video>
                <p><a href="/videos/\${videoId}.mp4" download>Download Video</a></p>
              \`;
              const button = document.querySelector('button[type="submit"]');
              button.disabled = false;
              button.textContent = 'Generate';
            } else if (data.status === 'error') {
              clearInterval(statusCheckInterval);
              document.getElementById('result').innerHTML = '<p style="color: red;">Error generating video</p>';
              const button = document.querySelector('button[type="submit"]');
              button.disabled = false;
              button.textContent = 'Generate';
            }
          } catch (error) {
            console.error('Status check error:', error);
          }
        }
        
        document.getElementById('generateForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const from = document.getElementById('from').value;
          const to = document.getElementById('to').value;
          const expectedTime = document.getElementById('expectedTime').value;
          const button = e.target.querySelector('button');
          const result = document.getElementById('result');
          
          button.disabled = true;
          button.textContent = 'Generating...';
          result.innerHTML = '<p class="loading">Starting generation...</p>';
          
          try {
            const response = await fetch('/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ from, to, expectedTime })
            });
            
            const data = await response.json();
            
            if (data.success) {
              // Start polling for status
              clearInterval(statusCheckInterval);
              statusCheckInterval = setInterval(() => checkStatus(data.videoId), 500);
              checkStatus(data.videoId);
            } else {
              result.innerHTML = '<p style="color: red;">Error starting video generation</p>';
              button.disabled = false;
              button.textContent = 'Generate';
            }
          } catch (error) {
            result.innerHTML = '<p style="color: red;">Error: ' + error.message + '</p>';
            button.disabled = false;
            button.textContent = 'Generate';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Status endpoint
app.get('/status/:videoId', (req, res) => {
  const { videoId } = req.params;
  const status = jobStatus.get(videoId) || { status: 'unknown' };
  res.json(status);
});

app.post('/generate', (req, res) => {
  const { from, to, expectedTime } = req.body;
  
  if (!from || !to) {
    return res.json({ success: false, error: 'Missing from or to' });
  }
  
  const fromLocation = from.trim() || 'Point A';
  const toLocation = to.trim() || 'Point B';
  const routeText = `${fromLocation} to ${toLocation} single`;
  
  const videoId = Math.random().toString(36).substr(2, 12);
  
  console.log(`[${new Date().toISOString()}] Generating: ${routeText}`);
  
  // Initialize job status
  jobStatus.set(videoId, { status: 'queued', progress: 0 });
  
  // Respond immediately
  res.json({
    success: true,
    videoId: videoId,
    route: routeText
  });
  
  // Generate in background
  setImmediate(() => {
    generateVideo(routeText, videoId, expectedTime || null, (err) => {
      if (err) {
        console.error('Error:', err);
      } else {
        console.log(`✓ Video generated: ${videoId}`);
      }
    });
  });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}/generate`);
});