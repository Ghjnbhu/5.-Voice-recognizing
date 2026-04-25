import React, { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

function App() {
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')
  const [microphoneLevel, setMicrophoneLevel] = useState(0)
  const [selectedLanguage, setSelectedLanguage] = useState('en-US')
  const [diagnosticInfo, setDiagnosticInfo] = useState('')
  const [diagnosticLogs, setDiagnosticLogs] = useState([])
  const recognitionRef = useRef(null)
  const audioContextRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const analyserNodeRef = useRef(null)
  const animationFrameRef = useRef(null)
  const restartTimeoutRef = useRef(null)
  // ✅ 1. Add a ref to always hold the current listening state
  const isListeningRef = useRef(false)

  const languages = [
    { code: 'en-US', name: 'English (US)' },
    { code: 'es-ES', name: 'Español' },
    { code: 'fr-FR', name: 'Français' },
    { code: 'de-DE', name: 'Deutsch' },
    { code: 'it-IT', name: 'Italiano' },
    { code: 'pt-PT', name: 'Português' },
    { code: 'ru-RU', name: 'Русский' },
    { code: 'ja-JP', name: '日本語' },
    { code: 'ko-KR', name: '한국어' },
    { code: 'zh-CN', name: '中文' },
  ]

  const addDiagnosticLog = (type, message, details = '') => {
    const timestamp = new Date().toLocaleTimeString()
    const log = { type, message, details, timestamp }
    setDiagnosticLogs(prev => [log, ...prev].slice(0, 20))
    setDiagnosticInfo(message)
    console.log(`${type}: ${message}`, details)
  }

  // Microphone level visualization
  const updateMicrophoneLevel = useCallback(() => {
    if (!analyserNodeRef.current) return
    const dataArray = new Uint8Array(analyserNodeRef.current.frequencyBinCount)
    analyserNodeRef.current.getByteTimeDomainData(dataArray)
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128
      sum += v * v
    }
    let average = Math.sqrt(sum / dataArray.length) || 0
    const level = Math.min(100, Math.floor(average * 200))
    setMicrophoneLevel(level)
    animationFrameRef.current = requestAnimationFrame(updateMicrophoneLevel)
  }, [])

  const startMicrophoneVisualization = useCallback(async () => {
    try {
      if (mediaStreamRef.current?.active) return
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      analyserNodeRef.current = audioContextRef.current.createAnalyser()
      analyserNodeRef.current.fftSize = 256
      const sourceNode = audioContextRef.current.createMediaStreamSource(stream)
      sourceNode.connect(analyserNodeRef.current)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }
      updateMicrophoneLevel()
    } catch (err) {
      console.error('Visualization error:', err)
    }
  }, [updateMicrophoneLevel])

  const stopMicrophoneVisualization = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    if (audioContextRef.current) audioContextRef.current.close()
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(track => track.stop())
    setMicrophoneLevel(0)
  }, [])

  // WORKAROUND: Manual restart in onend (fixes Android bug)
  const initRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addDiagnosticLog('ERROR', 'Speech recognition not supported');
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false; // Required for stability on Android
    recognition.interimResults = true;
    recognition.lang = selectedLanguage;

    recognition.onstart = () => {
      addDiagnosticLog('SUCCESS', '🎤 Engine Started');
    };

    recognition.onresult = (event) => {
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript + ' ';
        }
      }
      if (finalText) {
        setTranscript(prev => prev + finalText);
        addDiagnosticLog('SUCCESS', '📝 Captured phrase');
      }
    };

    recognition.onend = () => {
      // ✅ 2. Use the ref instead of the stale closure variable
      if (isListeningRef.current && document.visibilityState === 'visible') {
        addDiagnosticLog('INFO', '🔄 Auto-restarting...');
        
        // Increased buffer time (350ms) to ensure mic hardware releases
        if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = setTimeout(() => {
          try {
            recognition.start();
          } catch (err) {
            addDiagnosticLog('ERROR', 'Restart failed', err.message);
          }
        }, 350);
      } else {
        addDiagnosticLog('INFO', 'Stopped (Inactive state)');
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') {
        addDiagnosticLog('INFO', 'No speech, staying active...');
      } else {
        addDiagnosticLog('WARNING', `Error: ${event.error}`);
      }
    };

    return recognition;
  // ✅ 3. Remove isListening from dependencies – we use the ref now
  }, [selectedLanguage]);

  useEffect(() => {
    recognitionRef.current = initRecognition()
    addDiagnosticLog('INFO', 'App ready', 'Manual restart workaround active')
    return () => {
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current)
      if (recognitionRef.current) recognitionRef.current.abort()
      stopMicrophoneVisualization()
    }
  }, [initRecognition, stopMicrophoneVisualization])

  useEffect(() => {
    if (recognitionRef.current) {
      const wasListening = isListening
      if (wasListening) {
        try { recognitionRef.current.stop() } catch(e) {}
        setTimeout(() => {
          recognitionRef.current = initRecognition()
          if (wasListening) {
            try { recognitionRef.current.start() } catch(e) {}
          }
        }, 200)
      } else {
        recognitionRef.current = initRecognition()
      }
    }
  }, [selectedLanguage, initRecognition, isListening])

  const startListening = async () => {
    setError('')
    addDiagnosticLog('INFO', '▶️ Start button pressed', 'Manual restart mode')
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      
      setIsListening(true)
      isListeningRef.current = true   // ✅ 4. Update ref synchronously
      recognitionRef.current.start()
      addDiagnosticLog('SUCCESS', 'Listening active', 'Manual restart keeps it alive')
    } catch (err) {
      addDiagnosticLog('ERROR', 'Permission failed', err.message)
      setError(`Error: ${err.message}. Tap 🔒 and allow microphone.`)
    }
  }

  const stopListening = () => {
    addDiagnosticLog('INFO', '⏹️ Stopped by user', '')
    setIsListening(false)
    isListeningRef.current = false   // ✅ 5. Update ref synchronously
    
    if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current)
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch(e) {}
    }
    
    // ✅ THE ONLY FIX: stop microphone visualization (already present)
    stopMicrophoneVisualization()
  }

  const clearText = () => {
    setTranscript('')
    addDiagnosticLog('INFO', 'Text cleared', '')
  }

  const clearLogs = () => {
    setDiagnosticLogs([])
    addDiagnosticLog('INFO', 'Logs cleared', '')
  }

  const getLevelColor = () => {
    if (microphoneLevel < 20) return '#4caf50'
    if (microphoneLevel < 50) return '#8bc34a'
    if (microphoneLevel < 80) return '#ff9800'
    return '#f44336'
  }

  const getLogIcon = (type) => {
    switch(type) {
      case 'SUCCESS': return '✅'
      case 'ERROR': return '❌'
      case 'WARNING': return '⚠️'
      default: return '🔄'
    }
  }

  return (
    <div className="container">
      <h1>🎙️ Voice Recognition</h1>
      <p className="subtitle">Android Workaround Mode - Manual Restart Keeps It Alive</p>

      {error && <div className="error-message">⚠️ {error}</div>}

      <div className="language-selector">
        <label>🌍 Language:</label>
        <select value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)} disabled={isListening}>
          {languages.map(lang => (<option key={lang.code} value={lang.code}>{lang.name}</option>))}
        </select>
      </div>

      <div className="microphone-level-container">
        <div className="level-label">
          <span>🎤 Microphone Level</span>
          <span className="level-percentage">{isListening ? `${microphoneLevel}%` : '—%'}</span>
        </div>
        <div className="level-bar-bg">
          <div className="level-bar-fill" style={{ width: isListening ? `${microphoneLevel}%` : '0%', backgroundColor: getLevelColor() }} />
        </div>
        {isListening && microphoneLevel < 10 && (
          <div className="level-hint">🔴 No sound detected - speak louder</div>
        )}
        {isListening && microphoneLevel > 50 && (
          <div className="level-hint success">🟢 Voice detected! Speaking...</div>
        )}
      </div>

      <div className="visual-console">
        <div className="console-header">
          <strong>📱 Live Console (Manual Restart Mode)</strong>
          <button onClick={clearLogs} className="console-clear">Clear</button>
        </div>
        <div className="console-logs">
          {diagnosticLogs.length === 0 ? (
            <div className="console-empty">Tap "Start Listening" - manual restart keeps it alive!</div>
          ) : (
            diagnosticLogs.map((log, idx) => (
              <div key={idx} className={`console-log console-${log.type.toLowerCase()}`}>
                <span className="log-icon">{getLogIcon(log.type)}</span>
                <span className="log-time">{log.timestamp}</span>
                <span className="log-message">{log.message}</span>
                {log.details && <span className="log-details">({log.details})</span>}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="button-group">
        <button onClick={startListening} disabled={isListening} className="btn btn-start">🎤 Start Listening</button>
        <button onClick={stopListening} disabled={!isListening} className="btn btn-stop">⏹️ Stop</button>
        <button onClick={clearText} className="btn btn-clear">🗑️ Clear Text</button>
      </div>

      <div className="status">
        <span className="status-icon">{isListening ? '🔴' : '⚪'}</span>
        Status: {isListening ? '🔄 Listening (manual restart mode)' : 'Idle'}
        <span className="language-badge">{languages.find(l => l.code === selectedLanguage)?.name || selectedLanguage}</span>
      </div>

      <div className="transcript-container">
        <h3>Recognized Text:</h3>
        <div className="transcript-box">{transcript || 'Press Start and speak...'}</div>
      </div>

      <div className="info">
        <p>🔧 <strong>Why This Happens:</strong></p>
        <p>Chrome on Android has a known bug where <code>onresult</code> events don't fire properly with continuous recognition [citation:9]. This has been an open issue since 2013.</p>
        <p><strong>The Workaround:</strong> Manual restart in <code>onend</code> - recognition restarts after each phrase.</p>
        <ol>
          <li><strong>Press Start once</strong> - Recognition activates</li>
          <li><strong>Speak a phrase</strong> - Your words should appear</li>
          <li><strong>After a pause</strong> - Recognition restarts automatically</li>
          <li><strong>Watch the console</strong> - See "🔄 Manual restart..." messages</li>
        </ol>
        <p className="note">💡 If text still doesn't appear, try Chrome Beta or Canary - they sometimes fix this issue.</p>
      </div>
    </div>
  )
}

export default App