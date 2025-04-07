
// main.js
import { Controller } from './controller/controller.js';
import { printTextOnFrame } from './utils/camera_utils.js';

console.log('Starting main.js');

const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('outputCanvas');
const canvasCtx = canvasElement.getContext('2d');

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
        "json_path": "assets/man_keypoints_data_normalized.json",
        "reps": 3
    }
};

console.log('Creating Controller instance');
const controller = new Controller(exercisePlan);

async function setupCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('MediaDevices API is not supported in this browser or context.');
        alert('Please run this app over HTTP/HTTPS (e.g., via a local server) and ensure your browser supports the MediaDevices API.');
        return;
    }

    try {
        console.log('Requesting camera access');
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoElement.srcObject = stream;
        videoElement.onloadedmetadata = async () => {
            console.log('Video metadata loaded, starting playback');
            videoElement.play();
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
            console.log('Initializing controller');
            await controller.initialize();
            if (controller.segments.length > 0) {
                console.log('Starting exercise sequence');
                controller.startExerciseSequence();
                requestAnimationFrame(processFrame);
            } else {
                console.error('Failed to initialize segments, exercise cannot start');
                alert('Failed to load exercise data. Please check the JSON file path and contents.');
            }
        };
    } catch (error) {
        console.error('Error accessing camera:', error);
        alert('Could not access the camera. Please allow camera permissions and try again.');
    }
}

async function onResults(results) {
    console.log('Pose results received:', results);
    controller.updateFrame(results);
}

async function processFrame(timestamp) {
    console.log('Processing frame at timestamp:', timestamp);
    await pose.send({ image: videoElement });

    const currentTime = timestamp / 1000; // Convert to seconds
    
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

    controller.frame = canvasCtx;
    const [currentPhase, exerciseName, repCount, totalReps] = controller.processExercise(currentTime);

    if (repCount >= 0) {
        printTextOnFrame(canvasCtx, `Exercise: ${exerciseName} | Reps: ${repCount}/${totalReps}`, 
            { x: 10, y: 30 }, 'green');
    }

    canvasCtx.restore();
    requestAnimationFrame(processFrame);
}

console.log('Setting up camera');
setupCamera().catch(error => console.error('Setup camera failed:', error));