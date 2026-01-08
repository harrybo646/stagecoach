const { createCanvas, registerFont, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const express = require('express');

const app = express();
const port = 80;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static videos
app.use('/videos', express.static(path.join(__dirname, 'videos')));

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

// RGB to YUV conversion
function rgbToYuv(r, g, b) {
  const y = Math.round(16 + (65.738 * r + 129.057 * g + 25.064 * b) / 256);
  const u = Math.round(128 + (-37.945 * r - 74.494 * g + 112.439 * b) / 256);
  const v = Math.round(128 + (112.439 * r - 94.154 * g - 18.285 * b) / 256);
  return { y, u, v };
}

// ---------------------------
// VIDEO GENERATION FUNCTION (YUV)
// ---------------------------
function generateVideo(routeText, videoId, expectedTime, callback) {
  const originalWidth = 452;
  const workingWidth = 702;
  const workingHeight = 836;
  const boxExtension = 125;
  
  const workingCanvas = createCanvas(workingWidth, workingHeight);
  const workingCtx = workingCanvas.getContext('2d');

  const fps = 30;
  const videoDurationSeconds = 30;
  const totalFrames = videoDurationSeconds * fps;

  const countdownStartSeconds = 59 * 60 + 59;
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

  const selectedWord = randomWords[Math.floor(Math.random() * randomWords.length)];
  const generationStartTime = new Date();

  const circles = [];
  const numCircles = 10;
  const baseBoxY = 496;
  const boxHeight = 83;
  const circleAreaWidth = 452;
  const circleAreaStart = (workingWidth - circleAreaWidth) / 2;

  for (let i = 0; i < numCircles; i++) {
    circles.push({
      x: circleAreaStart + Math.random() * circleAreaWidth,
      y: baseBoxY + Math.random() * boxHeight,
      radius: 10 + Math.random() * 30,
      vx: (Math.random() - 0.5) * 3,
      vy: (Math.random() - 0.5) * 3,
      alpha: 0.1 + Math.random() * 0.15
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

  loadImage(path.join(__dirname, 'template.png')).then(templateImage => {
    const templateWidth = templateImage.width;
    const templateHeight = templateImage.height;
    
    const outputCanvas = createCanvas(templateWidth, templateHeight);
    const outputCtx = outputCanvas.getContext('2d');
    
    // Pre-render static elements to cache canvas
    const cachedWorkingCanvas = createCanvas(workingWidth, workingHeight);
    const cachedWorkingCtx = cachedWorkingCanvas.getContext('2d');
    
    cachedWorkingCtx.font = '30px "Circular"';
    cachedWorkingCtx.textAlign = 'center';
    cachedWorkingCtx.textBaseline = 'middle';
    cachedWorkingCtx.fillStyle = '#000';
    const titleCenterX = boxExtension + originalWidth / 2;
    const titleCenterY = 376 + 66 / 2;
    const titleMaxWidth = originalWidth - 122;
    wrapText(cachedWorkingCtx, routeText, titleCenterX, titleCenterY, titleMaxWidth, 36);
    
    cachedWorkingCtx.font = '18px "Circular"';
    const now = new Date();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'];
    const validText = `Valid from: ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}, ${String(now.getDate()).padStart(2,'0')} ${months[now.getMonth()]} ${now.getFullYear()}`;
    cachedWorkingCtx.fillText(validText, boxExtension + originalWidth / 2, 448 + 33 / 2);

    // Setup FFmpeg for YUV output
    const videosDir = path.join(__dirname, 'videos');
    if (!fs.existsSync(videosDir)) {
      fs.mkdirSync(videosDir);
    }
    const outputPath = path.join(videosDir, `${videoId}.mp4`);

    const args = [
      '-y',
      '-f', 'rawvideo',
      '-vcodec', 'rawvideo',
      '-pix_fmt', 'yuv420p',
      '-s', `${templateWidth}x${templateHeight}`,
      '-framerate', String(fps),
      '-i', '-',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
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

    let frameCount = 0;
    const startTime = Date.now();

    for (let i = 0; i < totalFrames; i++) {
      workingCtx.clearRect(0, 0, workingWidth, workingHeight);
      workingCtx.drawImage(cachedWorkingCanvas, 0, 0);

      const currentSecond = i / fps;
      const secondsLeft = countdownStartSeconds - Math.floor(currentSecond);
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
      
      if (expectedTime) {
        textToShow = estimatedTimeString;
        if (cycleTime < fadeDuration) {
          textOpacity = cycleTime / fadeDuration;
        } else if (cycleTime > (switchCycle * 2) - fadeDuration) {
          textOpacity = ((switchCycle * 2) - cycleTime) / fadeDuration;
        }
      } else {
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
      }

      workingCtx.font = '40px "Circular"';
      workingCtx.textAlign = 'center';
      workingCtx.textBaseline = 'middle';
      workingCtx.fillStyle = `rgba(0, 0, 0, ${textOpacity})`;
      
      const wordCenterX = boxExtension + originalWidth / 2;
      const textRelativeY = 63 / 2;
      const wordCenterY = avgTopY + 10 + textRelativeY;
      
      const wordMaxWidth = originalWidth - 122;
      wrapText(workingCtx, textToShow, wordCenterX, wordCenterY, wordMaxWidth, 48);

      workingCtx.font = '18px "Circular"';
      workingCtx.fillStyle = '#000';
      const countdownText = `Ticket expires in: 0h: ${minutes}m: ${seconds}s`;
      workingCtx.fillText(countdownText, boxExtension + 83 + 285 / 2, 608 + 33 / 2);

      // Composite final frame
      outputCtx.clearRect(0, 0, templateWidth, templateHeight);
      outputCtx.drawImage(templateImage, 0, 0);
      outputCtx.drawImage(workingCanvas, 0, 224);

      // Convert RGBA canvas to YUV420p
      const rgbaBuffer = outputCanvas.toBuffer('raw');
      const yuvBuffer = Buffer.alloc(yuvBufferSize);

      // Draw 702x216 box at center top (RGB 13, 22, 29)
      const topboxWidth = 702;
      const topboxHeight = 216;
      const topboxX = (templateWidth - topboxWidth) / 2;
      const topboxY = 0;
      const topboxColor = rgbToYuv(13, 22, 29);

      // Convert RGBA to YUV420p
      for (let y = 0; y < templateHeight; y++) {
        for (let x = 0; x < templateWidth; x++) {
          const rgbaIndex = (y * templateWidth + x) * 4;
          const r = rgbaBuffer[rgbaIndex];
          const g = rgbaBuffer[rgbaIndex + 1];
          const b = rgbaBuffer[rgbaIndex + 2];

          // Check if we're inside the box
          let yVal, uVal, vVal;
          if (x >= topboxX && x < topboxX + topboxWidth && y >= topboxY && y < topboxY + topboxHeight) {
            yVal = topboxColor.y;
            uVal = topboxColor.u;
            vVal = topboxColor.v;
          } else {
            const yuv = rgbToYuv(r, g, b);
            yVal = yuv.y;
            uVal = yuv.u;
            vVal = yuv.v;
          }

          // Y plane
          yuvBuffer[y * templateWidth + x] = yVal;

          // U and V planes (subsampled)
          if (y % 2 === 0 && x % 2 === 0) {
            const uvIndex = (y / 2) * (templateWidth / 2) + (x / 2);
            yuvBuffer[yPlaneSize + uvIndex] = uVal;
            yuvBuffer[yPlaneSize + uvPlaneSize + uvIndex] = vVal;
          }
        }
      }

      ffmpegProcess.stdin.write(yuvBuffer);

      frameCount++;
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
        callback(null, videoId);
      } else {
        console.error('FFmpeg error:', errorOutput);
        callback(new Error('FFmpeg failed with code ' + code));
      }
    });

    ffmpegProcess.on('error', (err) => {
      callback(err);
    });

  }).catch(err => {
    callback(err);
  });
}

// ---------------------------
// ROUTES
// ---------------------------

app.get('/generate', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bus Ticket Generator (YUV)</title>
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
      </style>
    </head>
    <body>
      <h1>Bus Ticket Generator</h1>
      <form id="generateForm">
        <input type="text" id="from" name="from" placeholder="From" required>
        <input type="text" id="to" name="to" placeholder="To" required>
        <input type="time" id="expectedTime" name="expectedTime" placeholder="Expected Time (optional)">
        <button type="submit">Generate</button>
      </form>
      <div id="result"></div>

      <script>
        document.getElementById('generateForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const from = document.getElementById('from').value;
          const to = document.getElementById('to').value;
          const expectedTime = document.getElementById('expectedTime').value;
          const button = e.target.querySelector('button');
          const result = document.getElementById('result');
          
          button.disabled = true;
          button.textContent = 'Generating...';
          result.innerHTML = '<p class="loading">Generating video, please wait...</p>';
          
          try {
            const response = await fetch('/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ from, to, expectedTime })
            });
            
            const data = await response.json();
            
            if (data.success) {
              result.innerHTML = \`
                <h2>Generated: \${data.route}</h2>
                <video controls autoplay>
                  <source src="/videos/\${data.videoId}.mp4" type="video/mp4">
                </video>
                <p><a href="/videos/\${data.videoId}.mp4" download>Download Video</a></p>
              \`;
            } else {
              result.innerHTML = '<p style="color: red;">Error generating video</p>';
            }
          } catch (error) {
            result.innerHTML = '<p style="color: red;">Error: ' + error.message + '</p>';
          }
          
          button.disabled = false;
          button.textContent = 'Generate';
        });
      </script>
    </body>
    </html>
  `);
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
  
  generateVideo(routeText, videoId, expectedTime || null, (err) => {
    if (err) {
      console.error('Error:', err);
      return res.json({ success: false, error: err.message });
    }
    
    console.log(`✓ Video generated: ${videoId}`);
    res.json({
      success: true,
      videoId: videoId,
      route: routeText
    });
  });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}/generate`);
});