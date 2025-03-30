import React, { useEffect, useRef, useState } from "react";

// Throttle delay in milliseconds for zoom state updates
// Adjust this value (e.g., 50-150ms) to balance smoothness and performance
const ZOOM_THROTTLE_DELAY = 100; // Update state at most once every 100ms

export default function LiveEQVisualizer() {
  const canvasRef = useRef(null);
  const [range, setRange] = useState({ minFreq: 20, maxFreq: 3000 });
  const [savedData, setSavedData] = useState(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  // --- Refs for Throttling ---
  const throttleTimeoutRef = useRef(null); // Stores the timeout ID
  const latestZoomRangeRef = useRef(null); // Stores the most recent calculated range during throttling

  // --- useEffect for audio setup and drawing ---
  useEffect(() => {
    let audioContext;
    let animationId;

    async function setupAudio() {
      // ... (setupAudio logic remains the same - including increased fftSize)
       try {
        if (analyserRef.current?.context && analyserRef.current.context.state !== 'closed') {
           await analyserRef.current.context.close().catch(e => console.error("Error closing previous AudioContext:", e));
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 8192; // Keep increased FFT Size
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        source.connect(analyser);
        analyserRef.current = analyser;
        dataArrayRef.current = dataArray;
        console.log(`Audio setup complete. Sample Rate: ${audioContext.sampleRate}, FFT Size: ${analyser.fftSize}, Bins: ${bufferLength}`);
        draw();
      } catch (err) {
        console.error("Error accessing microphone or setting up audio:", err);
         const canvas = canvasRef.current;
         if (canvas) {
             const ctx = canvas.getContext("2d");
             ctx.fillStyle = "red"; ctx.textAlign = "center"; ctx.font = "16px Arial";
             ctx.fillText("Error accessing microphone.", canvas.width / 2, canvas.height / 2);
         }
      }
    }

    function draw() {
        // ... (draw and renderFrame logic remains the same)
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;
        const bottomPadding = 20;
        const drawHeight = height - bottomPadding;
        const currentAnalyser = analyserRef.current;
        const currentDataArray = dataArrayRef.current;

        if (!currentAnalyser || !currentDataArray) {
            ctx.fillStyle = "#000"; ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = "white"; ctx.textAlign = 'center'; ctx.font = "14px Arial";
            ctx.fillText("Waiting for audio data...", width / 2, height / 2);
            return;
        }
        const sampleRate = currentAnalyser.context.sampleRate;
        const nyquist = sampleRate / 2;
        const bufferLength = currentAnalyser.frequencyBinCount;

      function renderFrame() {
        animationId = requestAnimationFrame(renderFrame);
        const analyser = analyserRef.current;
        const dataArray = dataArrayRef.current;
        if (!analyser || !dataArray) return;
        analyser.getByteFrequencyData(dataArray);

        // Drawing uses the main 'range' state, which is updated via throttle
        const currentMinFreq = Math.max(0, range.minFreq);
        const currentMaxFreq = Math.min(nyquist, range.maxFreq);

        // --- Clear Canvas ---
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);

        // --- Validate Range ---
        if (currentMinFreq >= currentMaxFreq) {
             ctx.fillStyle = "orange"; ctx.textAlign = 'center'; ctx.font = "14px Arial";
             ctx.fillText(`Invalid Range: Min ${Math.round(currentMinFreq)}Hz >= Max ${Math.round(currentMaxFreq)}Hz`, width / 2, height / 2);
             return;
        };
        const minIndex = Math.max(0, Math.floor((currentMinFreq / nyquist) * bufferLength));
        const maxIndex = Math.min(bufferLength, Math.ceil((currentMaxFreq / nyquist) * bufferLength));
        const visibleBars = Math.max(1, maxIndex - minIndex);
        const spacing = visibleBars > width ? 0 : 0.1;
        const totalSpacing = (visibleBars - 1) * spacing;
        const barWidth = Math.max(0.1, (width - totalSpacing) / visibleBars);

        // --- Draw Frequency Bars ---
        let x = 0;
        for (let i = minIndex; i < maxIndex; i++) {
           if (i >= dataArray.length) break;
          const barHeight = dataArray[i] ?? 0;
          const scaledHeight = (barHeight / 255) * drawHeight;
          if (scaledHeight >= 0.5) {
             if (savedData && i < savedData.length && savedData[i] !== undefined) {
                 const savedBarHeightRaw = savedData[i];
                 const scaledSavedHeight = (savedBarHeightRaw / 255) * drawHeight;
                 ctx.fillStyle = "rgba(255, 0, 0, 0.6)";
                 ctx.fillRect(x, drawHeight - scaledSavedHeight, barWidth, scaledSavedHeight);
                 const currentUpToSaved = Math.min(scaledHeight, scaledSavedHeight);
                 if (currentUpToSaved > 0) {
                     ctx.fillStyle = "rgba(30, 144, 255, 0.4)";
                     ctx.fillRect(x, drawHeight - currentUpToSaved, barWidth, currentUpToSaved);
                 }
                 if (scaledHeight > scaledSavedHeight) {
                     const extraHeight = scaledHeight - scaledSavedHeight;
                     ctx.fillStyle = "dodgerblue";
                     ctx.fillRect(x, drawHeight - scaledHeight, barWidth, extraHeight);
                 }
             } else {
                 ctx.fillStyle = "dodgerblue";
                 ctx.fillRect(x, drawHeight - scaledHeight, barWidth, scaledHeight);
             }
          }
          x += barWidth + spacing;
        }
        // --- Draw Frequency Markers ---
        ctx.fillStyle = "white"; ctx.font = "10px Arial"; ctx.textAlign = "center";
        const numMarkers = 6;
        const freqSpan = currentMaxFreq - currentMinFreq;
        if (freqSpan > 0) {
            for (let k = 0; k < numMarkers; k++) {
                const markerFreq = currentMinFreq + (freqSpan * k) / (numMarkers -1);
                const markerX = ((markerFreq - currentMinFreq) / freqSpan) * width;
                const textWidth = ctx.measureText(Math.round(markerFreq) + " Hz").width;
                const clampedX = Math.max(textWidth / 2, Math.min(width - textWidth / 2, markerX));
                ctx.fillText(Math.round(markerFreq) + " Hz", clampedX, height - 5);
            }
        } else {
             const markerX = width / 2;
             ctx.fillText(Math.round(currentMinFreq) + " Hz", markerX, height - 5);
        }
      }
      renderFrame();
    }

    setupAudio();

    // Cleanup function for the effect
    return () => {
      console.log("Cleanup: Cancelling animation frame");
      if (animationId) cancelAnimationFrame(animationId);
      // Clear any pending throttle timeout on cleanup
      clearTimeout(throttleTimeoutRef.current);

      const currentContext = analyserRef.current?.context;
       if (currentContext && currentContext instanceof AudioContext && currentContext.state !== 'closed') {
        currentContext.close()
          .then(() => console.log("Cleanup: AudioContext closed successfully."))
          .catch(e => console.error("Cleanup: Error closing AudioContext:", e));
      }
      analyserRef.current = null;
      dataArrayRef.current = null;
    };
  }, []); // Remove range/savedData dependency - draw loop reads state directly


  // --- useEffect for Wheel Zoom (with Throttle) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handleWheelZoom(e) {
       if (e.ctrlKey) {
        e.preventDefault();

        // --- Calculations happen immediately on each event ---
        const canvasRect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - canvasRect.left;
        const width = canvas.width;
        const currentRange = range; // Read current range state for calculation basis
        const currentAnalyser = analyserRef.current;
        const nyquist = currentAnalyser?.context?.sampleRate / 2 || 22050;
        const currentMinFreq = Math.max(0, currentRange.minFreq);
        const currentMaxFreq = Math.min(nyquist, currentRange.maxFreq);
        const currentSpan = currentMaxFreq - currentMinFreq;

        if (currentSpan <= 0) return;

        const freqRatio = mouseX / width;
        const freqAtMouse = currentMinFreq + freqRatio * currentSpan;
        const delta = e.deltaY;
        const zoomFactor = 1.15;
        let newSpan;
        if (delta < 0) { newSpan = currentSpan / zoomFactor; }
        else { newSpan = currentSpan * zoomFactor; newSpan = Math.min(newSpan, nyquist); }
        newSpan = Math.max(10, newSpan);
        const newMin = freqAtMouse - (freqAtMouse - currentMinFreq) * (newSpan / currentSpan);
        const newMax = newMin + newSpan;
        const clampedMin = Math.max(0, newMin);
        let clampedMax = Math.min(nyquist, newMax);
        if (clampedMax <= clampedMin) { clampedMax = clampedMin + 10; } // Ensure min span
        clampedMax = Math.min(nyquist, clampedMax);
        const finalRange = { minFreq: clampedMin, maxFreq: clampedMax };
        // --- Store the latest calculated range ---
        latestZoomRangeRef.current = finalRange;

        // --- THROTTLE LOGIC ---
        // If no timeout is currently pending, set one up
        if (!throttleTimeoutRef.current) {
           // console.log("Setting throttle timeout");
          throttleTimeoutRef.current = setTimeout(() => {
            // When timeout fires, apply the *last* calculated range
            if (latestZoomRangeRef.current) {
              // console.log(`Throttled Zoom: Updating range to ${latestZoomRangeRef.current.minFreq.toFixed(2)} - ${latestZoomRangeRef.current.maxFreq.toFixed(2)} Hz`);
              setRange(latestZoomRangeRef.current);
            }
            // Clear the timeout ID ref to allow a new timeout to be set
            throttleTimeoutRef.current = null;
            // console.log("Throttle timeout finished");
          }, ZOOM_THROTTLE_DELAY); // Use the defined throttle delay
        } else {
            // console.log("Throttle active, storing latest range only");
            // If a timeout is already pending, we just update latestZoomRangeRef.current
            // The existing timeout will eventually pick up this latest value when it fires.
        }
        // --- END THROTTLE ---
      }
    }

    canvas.addEventListener("wheel", handleWheelZoom, { passive: false });

    // Cleanup function for *this* zoom effect
    return () => {
        if(canvas) {
            canvas.removeEventListener("wheel", handleWheelZoom);
        }
        // Clear any pending throttle timeout when the component unmounts or effect re-runs
        clearTimeout(throttleTimeoutRef.current);
        // console.log("Zoom listener cleanup: Throttle timeout cleared.");
    };
     // This effect depends on the current `range` state to calculate the *next* step
     // correctly based on the current view.
  }, [range]);


  // Handler to Save Frame
  const handleSaveFrame = () => {
    if (dataArrayRef.current) {
      const savedCopy = new Uint8Array(dataArrayRef.current);
      setSavedData(savedCopy);
      console.log("Current frame saved for comparison.");
    } else {
       console.log("Cannot save frame, audio data not available.");
    }
  };

  // --- Component Render ---
  return (
    // ... (JSX remains the same as the previous version, including controls) ...
     <div style={{ width: "100%", maxWidth: "800px", margin: "20px auto", fontFamily: "sans-serif" }}>
      <h2 style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "10px", textAlign: 'center' }}>
        Live EQ Visualizer (Throttled Zoom, Finer Res)
      </h2>
      <div style={{ textAlign: 'center', marginBottom: '10px' }}>
        <button onClick={handleSaveFrame}>
          Save Frame for Comparison
        </button>
        {savedData && (
             <button onClick={() => setSavedData(null)} style={{ marginLeft: '10px'}}>
                 Clear Saved Frame
             </button>
        )}
      </div>

      <canvas
        ref={canvasRef}
        width={800}
        height={200}
        style={{ width: "100%", border: "1px solid #ccc", display: 'block', backgroundColor: '#f0f0f0' }}
      />

      {/* Frequency Range Controls */}
       <div style={{ marginTop: "10px", display: 'flex', justifyContent: 'center', gap: '15px', alignItems: 'center', fontSize: '12px' }}>
        <label style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
          Min:
          <input
            type="number"
            // Displaying the main 'range' state value
            value={Math.round(range.minFreq)}
            min={0}
            max={Math.max(0, Math.round(range.maxFreq - 1))}
            step={10}
            onChange={(e) => {
                 const newMin = Number(e.target.value);
                 if (!isNaN(newMin) && newMin < range.maxFreq) {
                    // Update state directly or throttle? Direct might be fine for input.
                    setRange(current => ({ ...current, minFreq: newMin }));
                 }
             }}
            style={{ width: '65px'}}
          />
          Hz
        </label>
        <label style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
          Max:
          <input
            type="number"
            // Displaying the main 'range' state value
            value={Math.round(range.maxFreq)}
            min={Math.min(22050, Math.round(range.minFreq + 1))}
            max={analyserRef.current?.context?.sampleRate / 2 || 22050}
            step={10}
            onChange={(e) => {
                const newMax = Number(e.target.value);
                 if (!isNaN(newMax) && newMax > range.minFreq) {
                     const nyquist = analyserRef.current?.context?.sampleRate / 2 || 22050;
                     // Update state directly or throttle? Direct might be fine for input.
                      setRange(current => ({ ...current, maxFreq: Math.min(nyquist, newMax) }));
                 }
            }}
            style={{ width: '65px'}}
          />
          Hz
        </label>
      </div>
    </div>
  );
}