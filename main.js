// main.js
import { Controller } from './controller/controller.js';
import { printTextOnFrame } from './utils/camera_utils.js';

console.log('Starting main.js');
const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('outputCanvas');
const canvasCtx = canvasElement.getContext('2d');
const cameraBtn = document.getElementById('cameraBtn');
const uploadBtn = document.getElementById('uploadBtn');
const videoUploadInput = document.getElementById('videoUploadInput');

console.log('Initializing MediaPipe Pose');
const pose = new Pose({
    locateFile: (file) => {
        console.log(`Loading MediaPipe file: ${file}`);
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
});
pose.setOptions({
    modelComplexity: 2,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});
pose.onResults(onResults);

const exercisePlan = {
    "Anuvittasana": {
        "json_path": "assets/Avuvittasana_female_video_keypoints.json",
        "reps": 3
    }
};

console.log('Creating Controller instance');
const controller = new Controller(exercisePlan);
let videoSource = null; // 'camera' or 'upload'
let lastVideoTime = -1;

// Set up camera
cameraBtn.addEventListener('click', () => {
    stopVideoSources();
    setupCamera();
    videoSource = 'camera';
});

// Set up video upload
uploadBtn.addEventListener('click', () => {
    videoUploadInput.click();
});

videoUploadInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        stopVideoSources();
        handleVideoUpload(e.target.files[0]);
        videoSource = 'upload';
    }
});

function stopVideoSources() {
    // Stop camera stream if exists
    if (videoElement.srcObject) {
        const tracks = videoElement.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        videoElement.srcObject = null;
    }
    
    // Clear uploaded video if exists
    if (videoElement.src) {
        URL.revokeObjectURL(videoElement.src);
        videoElement.src = '';
    }
}

async function setupCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('MediaDevices API not supported');
        alert('Please use HTTPS and a supported browser');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoElement.srcObject = stream;
        videoElement.onloadedmetadata = () => {
            initializeVideoProcessing();
        };
    } catch (error) {
        console.error('Camera error:', error);
        alert('Camera access denied. Please allow permissions.');
    }
}

function handleVideoUpload(file) {
    const url = URL.createObjectURL(file);
    videoElement.src = url;
    videoElement.onloadedmetadata = () => {
        initializeVideoProcessing();
    };
    videoElement.loop = true;
}

function initializeVideoProcessing() {
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    
    controller.initialize().then(() => {
        if (controller.segments.length > 0) {
            controller.startExerciseSequence();
            lastVideoTime = -1;
            requestAnimationFrame(processFrame);
        } else {
            console.error('Failed to initialize segments');
            alert('Exercise data failed to load');
        }
    }).catch(error => {
        console.error('Controller init error:', error);
    });
}

async function onResults(results) {
    controller.updateFrame(results);
}

async function processFrame(timestamp) {
    // For uploaded videos, only process new frames
    if (videoSource === 'upload') {
        if (videoElement.currentTime === lastVideoTime) {
            requestAnimationFrame(processFrame);
            return;
        }
        lastVideoTime = videoElement.currentTime;
    }

    await pose.send({ image: videoElement });
    
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

    const currentTime = timestamp / 1000;
    controller.frame = canvasCtx;
    const [currentPhase, exerciseName, repCount, totalReps] = controller.processExercise(currentTime);

    if (repCount >= 0) {
        printTextOnFrame(canvasCtx, `Exercise: ${exerciseName} | Reps: ${repCount}/${totalReps}`, 
            { x: 10, y: 30 }, 'green');
    }

    canvasCtx.restore();
    requestAnimationFrame(processFrame);
}