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

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static videos
app.use('/videos', express.static(path.join(__dirname, 'videos')));

// Job status tracking
const jobStatus = new Map();

// ---------------------------
// FONT REGISTRATION
// ---------------------------
const fontPath = path.join(__dirname, 'fonts', 'lineto-circular-medium.ttf');
if (fs.existsSync(fontPath)) {
  registerFont(fontPath, { family: 'Circular' });
  console.log('✓ Font registered');
} else {
  console.error('❌ Font file not found!');
  process.exit(1);
}

// ---------------------------
// COLOR SPACE CONVERSION (BT.709)
// ---------------------------
// BT.709 RGB → YUV conversion (limited range)
function rgbToYuvBT709(r, g, b) {
  const y = Math.round(16 + (0.2126 * r + 0.7152 * g + 0.0722 * b) * 219 / 255);
  const u = Math.round(128 + (-0.1146 * r - 0.3854 * g + 0.5 * b) * 224 / 255);
  const v = Math.round(128 + (0.5 * r - 0.4542 * g - 0.0458 * b) * 224 / 255);
  
  // Clamp to valid ranges
  return {
    y: Math.max(16, Math.min(235, y)),
    u: Math.max(16, Math.min(240, u)),
    v: Math.max(16, Math.min(240, v))
  };
}

// ---------------------------
// SEEDED RANDOM NUMBER GENERATOR
// ---------------------------
class SeededRandom {
  constructor(seed) {
    this.seed = seed;
  }
  
  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

// ---------------------------
// VIDEO GENERATION FUNCTION (OPTIMIZED)
// ---------------------------
async function generateVideo(routeText, videoId, expectedTime, callback) {
  const originalWidth = 452;
  const workingWidth = 702;
  const workingHeight = 836;
  const boxExtension = 125;
  
  const workingCanvas = createCanvas(workingWidth, workingHeight);
  const workingCtx = workingCanvas.getContext('2d');

  const fps = 30;
  const videoDurationSeconds = 30;
  const totalFrames = videoDurationSeconds * fps;

  const countdownStartSeconds = 57 * 60 + 59;
  const animationAmplitude = 12;
  const animationSpeed = 0.08;

  const randomWords = [
    'Adventure', 'Beautiful', 'Courage', 'Destiny', 'Elegant', 'Freedom', 'Gratitude',
    'Harmony', 'Inspire', 'Journey', 'Knowledge', 'Liberty', 'Majestic', 'Noble',
    'Opportunity', 'Passion', 'Quality', 'Resilience', 'Serenity', 'Triumph',
    'Unity', 'Victory', 'Wisdom', 'Zenith', 'Abundance', 'Blissful', 'Captivate',
    'Delightful', 'Energetic', 'Flourish', 'Graceful', 'Hopeful', 'Illuminate',
    'Joyful', 'Kindness', 'Laughter', 'Magnificent', 'Nurture', 'Optimism',
    'Peaceful', 'Radiant', 'Strength', 'Tranquil', 'Vibrant', 'Wonderful'
  ];

  // Use seeded random for reproducibility
  const rng = new SeededRandom(videoId.split('').reduce((a, b) => a + b.charCodeAt(0), 0));
  const selectedWord = randomWords[Math.floor(rng.next() * randomWords.length)];
  const generationStartTime = new Date();

  const circles = [];
  const numCircles = 10;
  const baseBoxY = 496;
  const boxHeight = 83;
  const circleAreaWidth = 352;
  const circleAreaStart = (workingWidth - circleAreaWidth) / 2;

  for (let i = 0; i < numCircles; i++) {
    circles.push({
      x: circleAreaStart + rng.next() * circleAreaWidth,
      y: baseBoxY + rng.next() * boxHeight,
      radius: 10 + rng.next() * 30,
      vx: (rng.next() - 0.5) * 3,
      vy: (rng.next() - 0.5) * 3,
      alpha: 0.1 + rng.next() * 0.15
    });
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    const lines = [];

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      if (ctx.measureText(testLine).width > maxWidth && n > 0) {
        lines.push(line);
        line = words[n] + ' ';
      } else {
        line = testLine;
      }
    }
    lines.push(line);

    const totalHeight = lines.length * lineHeight;
    let yPos = y - (totalHeight / 2) + (lineHeight / 2);
    
    lines.forEach(lineText => {
      ctx.fillText(lineText.trim(), x, yPos);
      yPos += lineHeight;
    });
  }

  try {
    const templateImage = await loadImage(path.join(__dirname, 'template.png'));
    const templateWidth = templateImage.width;
    const templateHeight = templateImage.height;
    
    const outputCanvas = createCanvas(templateWidth, templateHeight);
    const outputCtx = outputCanvas.getContext('2d');
    
    // Pre-render static elements to cache canvas
    const cachedWorkingCanvas = createCanvas(workingWidth, workingHeight);
    const cachedWorkingCtx = cachedWorkingCanvas.getContext('2d');
    
    cachedWorkingCtx.font = '30px "Circular", sans-serif';
    cachedWorkingCtx.textAlign = 'center';
    cachedWorkingCtx.textBaseline = 'middle';
    cachedWorkingCtx.fillStyle = '#000';
    const titleCenterX = boxExtension + originalWidth / 2;
    const titleCenterY = 376 + 66 / 2;
    const titleMaxWidth = originalWidth - 102;
    wrapText(cachedWorkingCtx, routeText, titleCenterX, titleCenterY, titleMaxWidth, 36);
    
    cachedWorkingCtx.font = '18px "Circular", sans-serif';
    const now = new Date();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'];
    const validText = `Valid from: ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}, ${String(now.getDate()).padStart(2,'0')} ${months[now.getMonth()]} ${now.getFullYear()}`;
    cachedWorkingCtx.fillText(validText, boxExtension + originalWidth / 2, 448 + 33 / 2);

    // Setup FFmpeg with proper color metadata
    const videosDir = path.join(__dirname, 'videos');
    if (!fs.existsSync(videosDir)) {
      fs.mkdirSync(videosDir);
    }
    const outputPath = path.join(videosDir, `${videoId}.mp4`);

    const args = [
      '-y',
      '-f', 'rawvideo',
      '-pix_fmt', 'yuv420p',
      '-colorspace', 'bt709',
      '-color_range', 'tv',
      '-s', `${templateWidth}x${templateHeight}`,
      '-framerate', String(fps),
      '-i', '-',
      '-c:v', 'libx264',
      '-profile:v', 'high',
      '-level', '4.1',
      '-pix_fmt', 'yuv420p',
      '-colorspace', 'bt709',
      '-color_range', 'tv',
      '-movflags', '+faststart',
      '-preset', 'ultrafast',
      outputPath
    ];

    const ffmpegProcess = spawn(ffmpegPath, args);
    
    let errorOutput = '';
    ffmpegProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    // YUV buffer setup
    const yPlaneSize = templateWidth * templateHeight;
    const uvPlaneSize = (templateWidth / 2) * (templateHeight / 2);
    const yuvBufferSize = yPlaneSize + uvPlaneSize * 2;

    // PRE-COMPUTE STATIC YUV PLANES (MAJOR OPTIMIZATION)
    const staticYUVBuffer = Buffer.alloc(yuvBufferSize);
    
    // Draw template to output canvas once
    outputCtx.clearRect(0, 0, templateWidth, templateHeight);
    outputCtx.drawImage(templateImage, 0, 0);
    
    // Get RGBA buffer for template
    const templateRGBA = outputCanvas.toBuffer('raw');
    
    // Top box constants (RGB 13, 22, 29)
    const topboxWidth = 702;
    const topboxHeight = 216;
    const topboxX = (templateWidth - topboxWidth) / 2;
    const topboxY = 0;
    const topboxColor = rgbToYuvBT709(13, 22, 29);
    
    // Pre-fill static YUV buffer (template only, no top box yet)
    for (let y = 0; y < templateHeight; y++) {
      for (let x = 0; x < templateWidth; x++) {
        const rgbaIndex = (y * templateWidth + x) * 4;
        const r = templateRGBA[rgbaIndex];
        const g = templateRGBA[rgbaIndex + 1];
        const b = templateRGBA[rgbaIndex + 2];

        const yuv = rgbToYuvBT709(r, g, b);
        staticYUVBuffer[y * templateWidth + x] = yuv.y;

        if (y % 2 === 0 && x % 2 === 0) {
          const uvIndex = (y / 2) * (templateWidth / 2) + (x / 2);
          staticYUVBuffer[yPlaneSize + uvIndex] = yuv.u;
          staticYUVBuffer[yPlaneSize + uvPlaneSize + uvIndex] = yuv.v;
        }
      }
    }

    let frameCount = 0;
    const startTime = Date.now();

    // Update job status
    jobStatus.set(videoId, { status: 'processing', progress: 0 });

    // Frame generation loop
    for (let i = 0; i < totalFrames; i++) {
      workingCtx.clearRect(0, 0, workingWidth, workingHeight);
      workingCtx.drawImage(cachedWorkingCanvas, 0, 0);

      const currentSecond = i / fps;
      const secondsLeft = Math.max(0, countdownStartSeconds - Math.floor(currentSecond)); // Clamped
      const minutes = Math.floor(secondsLeft / 60);
      const seconds = secondsLeft % 60;

      const estimatedTime = new Date(generationStartTime.getTime() + (currentSecond * 1000));
      const estimatedHours = String(estimatedTime.getHours()).padStart(2, '0');
      const estimatedMinutes = String(estimatedTime.getMinutes()).padStart(2, '0');
      const estimatedTimeString = expectedTime || `${estimatedHours}:${estimatedMinutes}`;

      const t = currentSecond;
      const cycleDuration = 1 / animationSpeed;
      const halfCycle = cycleDuration / 2;
      
      let tlPull = 0;
      let trPull = 0;
      
      const cyclePosition = t % cycleDuration;
      
      if (cyclePosition < halfCycle) {
        tlPull = Math.sin((cyclePosition / halfCycle) * Math.PI) * animationAmplitude;
      } else {
        trPull = Math.sin(((cyclePosition - halfCycle) / halfCycle) * Math.PI) * animationAmplitude;
      }

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
      });

      circles.forEach(circle => {
        workingCtx.fillStyle = `rgba(100, 100, 100, ${circle.alpha})`;
        workingCtx.beginPath();
        workingCtx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
        workingCtx.fill();
      });

      workingCtx.restore();

      const switchCycle = 2;
      const cycleTime = currentSecond % (switchCycle * 2);
      const fadeDuration = 0.3;
      
      let textToShow;
      let textOpacity = 1;
      
      if (cycleTime < switchCycle) {
        textToShow = selectedWord;
        if (cycleTime > switchCycle - fadeDuration) {
          textOpacity = (switchCycle - cycleTime) / fadeDuration;
        }
      } else {
        textToShow = estimatedTimeString;
        if (cycleTime < switchCycle + fadeDuration) {
          textOpacity = (cycleTime - switchCycle) / fadeDuration;
        }
        if (cycleTime > (switchCycle * 2) - fadeDuration) {
          textOpacity = ((switchCycle * 2) - cycleTime) / fadeDuration;
        }
      }

      workingCtx.font = '40px "Circular", sans-serif';
      workingCtx.textAlign = 'center';
      workingCtx.textBaseline = 'middle';
      workingCtx.fillStyle = `rgba(0, 0, 0, ${textOpacity})`;
      
      const wordCenterX = boxExtension + originalWidth / 2;
      const textRelativeY = 63 / 2;
      const wordCenterY = avgTopY + 10 + textRelativeY;
      const wordMaxWidth = originalWidth - 102;
      wrapText(workingCtx, textToShow, wordCenterX, wordCenterY, wordMaxWidth, 48);

      workingCtx.font = '18px "Circular", sans-serif';
      workingCtx.fillStyle = '#000';
      const countdownText = `Ticket expires in: 0h: ${minutes}m: ${seconds}s`;
      workingCtx.fillText(countdownText, boxExtension + 83 + 285 / 2, 608 + 33 / 2);

      // Composite final frame
      outputCtx.clearRect(0, 0, templateWidth, templateHeight);
      outputCtx.drawImage(templateImage, 0, 0);
      outputCtx.drawImage(workingCanvas, 0, 224);

      // OPTIMIZATION: Start with static buffer, only update animated region
      const yuvBuffer = Buffer.from(staticYUVBuffer);
      
      // Only convert the animated region (workingCanvas area)
      const rgbaBuffer = outputCanvas.toBuffer('raw');
      const animatedStartY = 224;
      const animatedEndY = 224 + workingHeight;
      
      for (let y = animatedStartY; y < animatedEndY && y < templateHeight; y++) {
        for (let x = 0; x < templateWidth; x++) {
          const rgbaIndex = (y * templateWidth + x) * 4;
          const r = rgbaBuffer[rgbaIndex];
          const g = rgbaBuffer[rgbaIndex + 1];
          const b = rgbaBuffer[rgbaIndex + 2];

          const yuv = rgbToYuvBT709(r, g, b);
          yuvBuffer[y * templateWidth + x] = yuv.y;

          if (y % 2 === 0 && x % 2 === 0) {
            const uvIndex = (y / 2) * (templateWidth / 2) + (x / 2);
            yuvBuffer[yPlaneSize + uvIndex] = yuv.u;
            yuvBuffer[yPlaneSize + uvPlaneSize + uvIndex] = yuv.v;
          }
        }
      }

      ///////////////

      // DARK FRAME WITH ROUNDED CARD CUTOUT (CORRECT)
      const borderWidth = 100;
      const topBorderExtra = 115;
      const bottomBorderReduction = 20; // Reduce bottom border by 20px (card goes lower)
      const cornerRadius = 15;
      const borderColor = rgbToYuvBT709(13, 22, 29);
      const r2 = cornerRadius * cornerRadius;

      const cardX = borderWidth;
      const cardY = borderWidth + topBorderExtra;
      const cardW = templateWidth  - borderWidth * 2;
      const cardH = templateHeight - borderWidth * 2 - topBorderExtra + bottomBorderReduction;

      for (let y = 0; y < templateHeight; y++) {
        for (let x = 0; x < templateWidth; x++) {

          let insideCard = false;

          // ─── Central rectangle ───
          if (
            x >= cardX + cornerRadius &&
            x <  cardX + cardW - cornerRadius &&
            y >= cardY &&
            y <  cardY + cardH
          ) insideCard = true;

          if (
            x >= cardX &&
            x <  cardX + cardW &&
            y >= cardY + cornerRadius &&
            y <  cardY + cardH - cornerRadius
          ) insideCard = true;

          // ─── Rounded corners ───

          // Top-left
          if (x < cardX + cornerRadius && y < cardY + cornerRadius) {
            const dx = x - (cardX + cornerRadius);
            const dy = y - (cardY + cornerRadius);
            if (dx * dx + dy * dy <= r2) insideCard = true;
          }

          // Top-right
          if (x >= cardX + cardW - cornerRadius && y < cardY + cornerRadius) {
            const dx = x - (cardX + cardW - cornerRadius - 1);
            const dy = y - (cardY + cornerRadius);
            if (dx * dx + dy * dy <= r2) insideCard = true;
          }

          // Bottom-left
          if (x < cardX + cornerRadius && y >= cardY + cardH - cornerRadius) {
            const dx = x - (cardX + cornerRadius);
            const dy = y - (cardY + cardH - cornerRadius - 1);
            if (dx * dx + dy * dy <= r2) insideCard = true;
          }

          // Bottom-right
          if (x >= cardX + cardW - cornerRadius && y >= cardY + cardH - cornerRadius) {
            const dx = x - (cardX + cardW - cornerRadius - 1);
            const dy = y - (cardY + cardH - cornerRadius - 1);
            if (dx * dx + dy * dy <= r2) insideCard = true;
          }

          // ─── Paint everything OUTSIDE the card ───
          if (!insideCard) {
            yuvBuffer[y * templateWidth + x] = borderColor.y;

            if ((y & 1) === 0 && (x & 1) === 0) {
              const uvIndex = (y >> 1) * (templateWidth >> 1) + (x >> 1);
              yuvBuffer[yPlaneSize + uvIndex] = borderColor.u;
              yuvBuffer[yPlaneSize + uvPlaneSize + uvIndex] = borderColor.v;
            }
          }
        }
      }

      // ADD "Your ticket" text AFTER border is drawn
      const tempCanvas = createCanvas(124, 27);
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.fillStyle = '#FFF';
      tempCtx.font = '25px "Circular", sans-serif';
      tempCtx.textAlign = 'center';
      tempCtx.textBaseline = 'middle';
      tempCtx.fillText('Your ticket', 62, 13.5);
      
      // Convert temp canvas to YUV and apply to buffer
      const textRGBA = tempCanvas.toBuffer('raw');
      const textStartX = 289;  // Horizontally centered
      const textStartY = 170;  // 15px into top border from card edge (moved up 5px)
      
      for (let ty = 0; ty < 27; ty++) {
        for (let tx = 0; tx < 124; tx++) {
          const rgbaIndex = (ty * 124 + tx) * 4;
          const alpha = textRGBA[rgbaIndex + 3];
          
          if (alpha > 128) { // Only draw visible pixels
            const r = textRGBA[rgbaIndex];
            const g = textRGBA[rgbaIndex + 1];
            const b = textRGBA[rgbaIndex + 2];
            
            const yuv = rgbToYuvBT709(r, g, b);
            const finalY = textStartY + ty;
            const finalX = textStartX + tx;
            
            if (finalY >= 0 && finalY < templateHeight && finalX >= 0 && finalX < templateWidth) {
              yuvBuffer[finalY * templateWidth + finalX] = yuv.y;
              
              if ((finalY & 1) === 0 && (finalX & 1) === 0) {
                const uvIndex = (finalY >> 1) * (templateWidth >> 1) + (finalX >> 1);
                yuvBuffer[yPlaneSize + uvIndex] = yuv.u;
                yuvBuffer[yPlaneSize + uvPlaneSize + uvIndex] = yuv.v;
              }
            }
          }
        }
      }

      //////////////

      // BACKPRESSURE HANDLING
      if (!ffmpegProcess.stdin.write(yuvBuffer)) {
        await once(ffmpegProcess.stdin, 'drain');
      }

      frameCount++;
      
      // Update progress
      const progress = Math.round((frameCount / totalFrames) * 100);
      jobStatus.set(videoId, { status: 'processing', progress });
      
      if (frameCount % 150 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const fps_actual = (frameCount / elapsed).toFixed(1);
        console.log(`  Progress: ${frameCount}/${totalFrames} frames (${fps_actual} fps)`);
      }
    }

    ffmpegProcess.stdin.end();

    ffmpegProcess.on('close', code => {
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      
      if (code === 0) {
        console.log(`  ✓ Completed in ${totalTime}s`);
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

// ---------------------------
// VIDEO CLEANUP (TTL: 1 hour)
// ---------------------------
function cleanupOldVideos() {
  const videosDir = path.join(__dirname, 'videos');
  if (!fs.existsSync(videosDir)) return;
  
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour
  
  fs.readdir(videosDir, (err, files) => {
    if (err) return;
    
    files.forEach(file => {
      const filePath = path.join(videosDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        if (now - stats.mtimeMs > maxAge) {
          fs.unlink(filePath, () => {
            console.log(`🗑️  Cleaned up: ${file}`);
          });
        }
      });
    });
  });
}

// Run cleanup every 15 minutes
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
  const routeText = `${fromLocation} to ${toLocation} Single`;
  
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