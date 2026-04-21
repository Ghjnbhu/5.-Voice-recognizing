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

  const languages = [
    { code: 'en-US', name: 'English (US)' },
    { code: 'en-GB', name: 'English (UK)' },
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

  // Add diagnostic log
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
      addDiagnosticLog('INFO', 'Requesting microphone access...')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      addDiagnosticLog('SUCCESS', 'Microphone access granted!')
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
      addDiagnosticLog('ERROR', 'Microphone access failed', err.message)
    }
  }, [updateMicrophoneLevel])

  const stopMicrophoneVisualization = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    if (audioContextRef.current) audioContextRef.current.close()
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(track => track.stop())
    setMicrophoneLevel(0)
  }, [])

  // Initialize speech recognition - FIXED for Android (like dictation.io)
  const initRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      addDiagnosticLog('ERROR', 'Speech recognition not supported')
      setError('Speech recognition not supported')
      return null
    }

    addDiagnosticLog('INFO', 'Initializing speech recognition...', `Language: ${selectedLanguage}`)
    const recognition = new SpeechRecognition()
    
    // CRITICAL: continuous MUST be true on Android
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = selectedLanguage
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      addDiagnosticLog('SUCCESS', '🎤 Recognition started!', 'Continuous mode ON - speak freely')
      startMicrophoneVisualization()
    }

    recognition.onresult = (event) => {
      addDiagnosticLog('SUCCESS', `📝 Results received!`, `${event.results.length} result(s)`)
      
      let finalText = ''
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript
        if (result.isFinal) {
          finalText += text + ' '
          addDiagnosticLog('SUCCESS', `📝 Captured: "${text}"`, 'Added to transcript')
        } else {
          addDiagnosticLog('INFO', `🎤 Hearing: "${text}"`, 'Interim result')
        }
      }
      
      if (finalText) {
        setTranscript(prev => prev + finalText)
      }
    }

    recognition.onerror = (event) => {
      addDiagnosticLog('WARNING', `Recognition error: ${event.error}`, '')
      if (event.error === 'not-allowed') {
        setError('Microphone access denied. Tap 🔒 → Allow microphone')
        setIsListening(false)
        stopMicrophoneVisualization()
      } else if (event.error === 'no-speech') {
        addDiagnosticLog('INFO', 'No speech detected', 'Still listening...')
      }
    }

    recognition.onend = () => {
      addDiagnosticLog('INFO', 'Recognition session ended', 'Click Start again to resume')
      setIsListening(false)
      stopMicrophoneVisualization()
    }

    recognition.onsoundstart = () => {
      addDiagnosticLog('SUCCESS', '🔊 Sound detected!', 'Processing speech')
    }

    recognition.onspeechend = () => {
      addDiagnosticLog('INFO', 'Speech ended', 'Waiting for more...')
    }

    return recognition
  }, [selectedLanguage, startMicrophoneVisualization, stopMicrophoneVisualization])

  // Initialize on mount
  useEffect(() => {
    recognitionRef.current = initRecognition()
    addDiagnosticLog('INFO', 'App ready', 'Tap Start Listening - continuous mode active')
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort()
      stopMicrophoneVisualization()
    }
  }, [initRecognition, stopMicrophoneVisualization])

  // Handle language change
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
    setTranscript('')
    addDiagnosticLog('INFO', '▶️ Start button pressed', 'Continuous mode enabled')
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      
      recognitionRef.current.start()
      setIsListening(true)
      addDiagnosticLog('SUCCESS', 'Continuous listening active', 'Speak - it will stay on')
    } catch (err) {
      addDiagnosticLog('ERROR', 'Microphone permission failed', err.message)
      setError(`Microphone error: ${err.message}. Tap 🔒 and allow microphone.`)
    }
  }

  const stopListening = () => {
    addDiagnosticLog('INFO', '⏹️ Stop button pressed', '')
    setIsListening(false)
    
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch(e) {}
    }
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
      default: return '📱'
    }
  }

  return (
    <div className="container">
      <h1>🎙️ Voice Recognition</h1>
      <p className="subtitle">Continuous Dictation - Like dictation.io - Works on Android!</p>

      {error && <div className="error-message">⚠️ {error}</div>}

      <div className="language-selector">
        <label>🌍 Language:</label>
        <select value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)} disabled={isListening}>
          {languages.map(lang => (<option key={lang.code} value={lang.code}>{lang.name}</option>))}
        </select>
      </div>

      {/* Microphone Level Bar */}
      <div className="microphone-level-container">
        <div className="level-label">
          <span>🎤 Microphone Level</span>
          <span className="level-percentage">{isListening ? `${microphoneLevel}%` : '—%'}</span>
        </div>
        <div className="level-bar-bg">
          <div className="level-bar-fill" style={{ width: isListening ? `${microphoneLevel}%` : '0%', backgroundColor: getLevelColor() }} />
        </div>
        {isListening && microphoneLevel < 10 && (
          <div className="level-hint">🔴 No sound detected - speak louder or check microphone</div>
        )}
        {isListening && microphoneLevel > 50 && (
          <div className="level-hint success">🟢 Great! Microphone is picking up your voice</div>
        )}
      </div>

      {/* Visual Console - Live Diagnostics */}
      <div className="visual-console">
        <div className="console-header">
          <strong>📱 Live Console (Continuous Mode)</strong>
          <button onClick={clearLogs} className="console-clear">Clear</button>
        </div>
        <div className="console-logs">
          {diagnosticLogs.length === 0 ? (
            <div className="console-empty">Tap "Start Listening" - it will stay on!</div>
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
        <button onClick={startListening} disabled={isListening} className="btn btn-start">🎤 Start Listening (Continuous)</button>
        <button onClick={stopListening} disabled={!isListening} className="btn btn-stop">⏹️ Stop</button>
        <button onClick={clearText} className="btn btn-clear">🗑️ Clear Text</button>
      </div>

      <div className="status">
        <span className="status-icon">{isListening ? '🔴' : '⚪'}</span>
        Status: {isListening ? '🔁 Continuous Listening (stays on)' : 'Idle'}
        <span className="language-badge">{languages.find(l => l.code === selectedLanguage)?.name || selectedLanguage}</span>
      </div>

      <div className="transcript-container">
        <h3>Recognized Text:</h3>
        <div className="transcript-box">{transcript || 'Press Start and just keep speaking...'}</div>
      </div>

      <div className="info">
        <p>🎤 <strong>How it works (like dictation.io):</strong></p>
        <ol>
          <li><strong>Press Start once</strong> - Then just keep speaking!</li>
          <li><strong>Continuous mode</strong> - Mic stays on continuously (no auto-restart needed)</li>
          <li><strong>Works on Android</strong> - Same settings as dictation.io</li>
          <li><strong>Watch the console</strong> - See "📝 Results received!" when text is captured</li>
          <li><strong>Microphone level</strong> - Shows your input volume in real-time</li>
        </ol>
        <p className="note">💡 On Android, continuous mode keeps the microphone active. Just speak naturally!</p>
      </div>
    </div>
  )
}

export default App