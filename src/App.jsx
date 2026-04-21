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
  const isRestartingRef = useRef(false)

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

  // Auto-restart function
  const autoRestart = useCallback(() => {
    if (!isListening) return
    if (isRestartingRef.current) return
    
    isRestartingRef.current = true
    addDiagnosticLog('INFO', '🔄 Auto-restarting...', 'Keeping microphone alive')
    
    if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current)
    
    restartTimeoutRef.current = setTimeout(() => {
      if (isListening && recognitionRef.current) {
        try {
          recognitionRef.current.start()
          setTimeout(() => { isRestartingRef.current = false }, 100)
        } catch (err) {
          addDiagnosticLog('ERROR', 'Restart failed', err.message)
          isRestartingRef.current = false
        }
      } else {
        isRestartingRef.current = false
      }
    }, 50)
  }, [isListening])

  // Initialize speech recognition
  const initRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      addDiagnosticLog('ERROR', 'Speech recognition not supported')
      setError('Speech recognition not supported')
      return null
    }

    addDiagnosticLog('INFO', 'Initializing speech recognition...', `Language: ${selectedLanguage}`)
    const recognition = new SpeechRecognition()
    
    // Use continuous: false for better Android auto-restart
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = selectedLanguage
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      addDiagnosticLog('SUCCESS', '🎤 Recognition started!', 'Listening for speech')
      startMicrophoneVisualization()
    }

    recognition.onresult = (event) => {
      let finalText = ''
      
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript
        if (result.isFinal) {
          finalText += text + ' '
          addDiagnosticLog('SUCCESS', `📝 Captured: "${text}"`, 'Added to transcript')
        } else {
          addDiagnosticLog('INFO', `🎤 Hearing: "${text}"`, 'Interim')
        }
      }
      
      if (finalText) {
        setTranscript(prev => prev + finalText)
      }
    }

    recognition.onerror = (event) => {
      addDiagnosticLog('WARNING', `Error: ${event.error}`, 'Auto-restarting...')
      if (event.error === 'not-allowed') {
        setError('Microphone access denied')
        setIsListening(false)
      } else if (event.error === 'no-speech') {
        // Silent - just restart
        if (isListening) autoRestart()
      } else if (event.error === 'audio-capture') {
        setError('No microphone found')
        setIsListening(false)
      }
    }

    recognition.onend = () => {
      addDiagnosticLog('INFO', 'Session ended', isListening ? 'Auto-restarting...' : 'Stopped')
      if (isListening) {
        autoRestart()
      } else {
        stopMicrophoneVisualization()
      }
    }

    recognition.onsoundstart = () => {
      addDiagnosticLog('SUCCESS', '🔊 Sound detected!', 'Processing')
    }

    recognition.onspeechend = () => {
      addDiagnosticLog('INFO', 'Speech ended', 'Transcribing...')
    }

    return recognition
  }, [selectedLanguage, startMicrophoneVisualization, stopMicrophoneVisualization, autoRestart, isListening])

  // Initialize on mount
  useEffect(() => {
    recognitionRef.current = initRecognition()
    addDiagnosticLog('INFO', 'App ready', 'Tap Start - auto-restart keeps it alive')
    return () => {
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current)
      if (recognitionRef.current) recognitionRef.current.abort()
      stopMicrophoneVisualization()
    }
  }, [initRecognition, stopMicrophoneVisualization])

  // Update recognition when language changes
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
    addDiagnosticLog('INFO', '▶️ Start button pressed', 'Auto-restart enabled')
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      
      setIsListening(true)
      recognitionRef.current.start()
      addDiagnosticLog('SUCCESS', 'Listening active', 'Auto-restart will keep it alive')
    } catch (err) {
      addDiagnosticLog('ERROR', 'Permission failed', err.message)
      setError(`Error: ${err.message}. Tap 🔒 and allow microphone.`)
      setIsListening(false)
    }
  }

  const stopListening = () => {
    addDiagnosticLog('INFO', '⏹️ Stopped by user', '')
    setIsListening(false)
    
    if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current)
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch(e) {}
    }
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
      <p className="subtitle">Auto-Restart Mode - Never Stops Listening!</p>

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
          <div className="level-hint success">🟢 Great! Voice detected</div>
        )}
      </div>

      {/* Visual Console */}
      <div className="visual-console">
        <div className="console-header">
          <strong>📱 Live Console (Auto-Restart Active)</strong>
          <button onClick={clearLogs} className="console-clear">Clear</button>
        </div>
        <div className="console-logs">
          {diagnosticLogs.length === 0 ? (
            <div className="console-empty">Tap "Start Listening" - it will never stop!</div>
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
        Status: {isListening ? '🔁 Auto-Restart Mode (never stops)' : 'Idle'}
        <span className="language-badge">{languages.find(l => l.code === selectedLanguage)?.name || selectedLanguage}</span>
      </div>

      <div className="transcript-container">
        <h3>Recognized Text:</h3>
        <div className="transcript-box">{transcript || 'Press Start and keep speaking...'}</div>
      </div>

      <div className="info">
        <p>🎤 <strong>How Auto-Restart Works:</strong></p>
        <ol>
          <li><strong>Press Start once</strong> - Recognition activates</li>
          <li><strong>Speak naturally</strong> - Your words appear in real-time</li>
          <li><strong>After each phrase</strong> - Recognition restarts automatically (50ms)</li>
          <li><strong>Never stops</strong> - You can pause, think, and continue speaking</li>
          <li><strong>Watch the console</strong> - See "🔄 Auto-restarting..." messages</li>
        </ol>
        <p className="note">💡 The mic auto-restarts instantly after each phrase - you won't notice it!</p>
      </div>
    </div>
  )
}

export default App