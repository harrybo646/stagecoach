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

// ---------------------------
// VIDEO GENERATION FUNCTION
// ---------------------------
function generateVideo(routeText, videoId, callback) {
  const workingWidth = 452;
  const workingHeight = 836;
  
  const workingCanvas = createCanvas(workingWidth, workingHeight);
  const workingCtx = workingCanvas.getContext('2d');

  const fps = 30;
  const videoDurationSeconds = 20;
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
  const numCircles = 15;
  const baseBoxY = 496;
  const boxHeight = 83;

  for (let i = 0; i < numCircles; i++) {
    circles.push({
      x: Math.random() * workingWidth,
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

  const framesDir = path.join(__dirname, 'frames', videoId);
  if (!fs.existsSync(framesDir)) {
    fs.mkdirSync(framesDir, { recursive: true });
  }

  loadImage(path.join(__dirname, 'template.png')).then(templateImage => {
    const templateWidth = templateImage.width;
    const templateHeight = templateImage.height;
    
    const outputCanvas = createCanvas(templateWidth, templateHeight);
    const outputCtx = outputCanvas.getContext('2d');
    
    const cachedWorkingCanvas = createCanvas(workingWidth, workingHeight);
    const cachedWorkingCtx = cachedWorkingCanvas.getContext('2d');
    
    cachedWorkingCtx.font = '30px "Circular"';
    cachedWorkingCtx.textAlign = 'center';
    cachedWorkingCtx.textBaseline = 'middle';
    cachedWorkingCtx.fillStyle = '#000';
    const titleCenterX = workingWidth / 2;
    const titleCenterY = 376 + 66 / 2;
    const titleMaxWidth = workingWidth - 122;
    wrapText(cachedWorkingCtx, routeText, titleCenterX, titleCenterY, titleMaxWidth, 36);
    
    cachedWorkingCtx.font = '18px "Circular"';
    const now = new Date();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'];
    const validText = `Valid from: ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}, ${String(now.getDate()).padStart(2,'0')} ${months[now.getMonth()]} ${now.getFullYear()}`;
    cachedWorkingCtx.fillText(validText, workingWidth / 2, 448 + 33 / 2);

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
      const estimatedTimeString = `${estimatedHours}:${estimatedMinutes}`;

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

      workingCtx.fillStyle = '#D9D9D9';
      workingCtx.beginPath();
      workingCtx.moveTo(0, baseBoxY + tlPull);
      workingCtx.lineTo(workingWidth, baseBoxY + trPull);
      workingCtx.lineTo(workingWidth, baseBoxY + boxHeight + trPull);
      workingCtx.lineTo(0, baseBoxY + boxHeight + tlPull);
      workingCtx.closePath();
      workingCtx.fill();

      workingCtx.save();
      
      workingCtx.beginPath();
      workingCtx.moveTo(0, baseBoxY + tlPull);
      workingCtx.lineTo(workingWidth, baseBoxY + trPull);
      workingCtx.lineTo(workingWidth, baseBoxY + boxHeight + trPull);
      workingCtx.lineTo(0, baseBoxY + boxHeight + tlPull);
      workingCtx.closePath();
      workingCtx.clip();

      circles.forEach(circle => {
        circle.x += circle.vx;
        circle.y += circle.vy;

        if (circle.x < -circle.radius) circle.x = workingWidth + circle.radius;
        if (circle.x > workingWidth + circle.radius) circle.x = -circle.radius;

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

      workingCtx.font = '40px "Circular"';
      workingCtx.textAlign = 'center';
      workingCtx.textBaseline = 'middle';
      workingCtx.fillStyle = `rgba(0, 0, 0, ${textOpacity})`;
      
      const wordCenterX = workingWidth / 2;
      const textRelativeY = 63 / 2;
      const wordCenterY = avgTopY + 10 + textRelativeY;
      
      const wordMaxWidth = workingWidth - 122;
      wrapText(workingCtx, textToShow, wordCenterX, wordCenterY, wordMaxWidth, 48);

      workingCtx.font = '18px "Circular"';
      workingCtx.fillStyle = '#000';
      const countdownText = `Ticket expires in: 0h:${minutes}m:${seconds}s`;
      workingCtx.fillText(countdownText, 83 + 285 / 2, 608 + 33 / 2);

      outputCtx.clearRect(0, 0, templateWidth, templateHeight);
      outputCtx.drawImage(templateImage, 0, 0);
      outputCtx.drawImage(workingCanvas, 125, 224);

      const frameNumber = String(i).padStart(6, '0');
      fs.writeFileSync(path.join(framesDir, `frame_${frameNumber}.png`), outputCanvas.toBuffer('image/png'));
    }

    const inputPattern = path.join(framesDir, 'frame_%06d.png');
    const videosDir = path.join(__dirname, 'videos');
    if (!fs.existsSync(videosDir)) {
      fs.mkdirSync(videosDir);
    }
    const outputPath = path.join(videosDir, `${videoId}.mp4`);

    const args = [
      '-y',
      '-framerate', String(fps),
      '-start_number', '0',
      '-i', inputPattern,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'ultrafast',
      outputPath
    ];

    const ffmpegProcess = spawn(ffmpegPath, args);

    ffmpegProcess.on('close', code => {
      fs.rmSync(framesDir, { recursive: true });
      
      if (code === 0) {
        callback(null, videoId);
      } else {
        callback(new Error('FFmpeg failed'));
      }
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
      <title>Bus Ticket Generator</title>
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
      </style>
    </head>
    <body>
      <h1>Bus Ticket Generator</h1>
      <form id="generateForm">
        <input type="text" id="from" name="from" placeholder="From" required>
        <input type="text" id="to" name="to" placeholder="To" required>
        <button type="submit">Generate</button>
      </form>
      <div id="result"></div>

      <script>
        document.getElementById('generateForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const from = document.getElementById('from').value;
          const to = document.getElementById('to').value;
          const button = e.target.querySelector('button');
          const result = document.getElementById('result');
          
          button.disabled = true;
          button.textContent = 'Generating...';
          result.innerHTML = '<p class="loading">Generating video, please wait...</p>';
          
          try {
            const response = await fetch('/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ from, to })
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
  const { from, to } = req.body;
  
  if (!from || !to) {
    return res.json({ success: false, error: 'Missing from or to' });
  }
  
  const fromLocation = from.trim() || 'Point A';
  const toLocation = to.trim() || 'Point B';
  const routeText = `${fromLocation} to ${toLocation} Single`;
  
  const videoId = Math.random().toString(36).substr(2, 12);
  
  console.log(`[${new Date().toISOString()}] Generating: ${routeText}`);
  
  generateVideo(routeText, videoId, (err) => {
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