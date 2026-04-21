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

  // Add diagnostic log (visible on screen for Android)
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
      addDiagnosticLog('SUCCESS', 'Microphone access granted!', 'Level bar will move when you speak')
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
      addDiagnosticLog('ERROR', 'Microphone access failed', err.message)
      setError('Microphone access denied. Tap the 🔒 icon in address bar and allow microphone.')
    }
  }, [updateMicrophoneLevel])

  const stopMicrophoneVisualization = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    if (audioContextRef.current) audioContextRef.current.close()
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(track => track.stop())
    setMicrophoneLevel(0)
  }, [])

  // Initialize speech recognition
  const initRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      addDiagnosticLog('ERROR', 'Speech recognition not supported', 'Try Chrome or Edge')
      setError('Speech recognition not supported')
      return null
    }

    addDiagnosticLog('INFO', 'Initializing speech recognition...', `Language: ${selectedLanguage}`)
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = selectedLanguage

    recognition.onstart = () => {
      addDiagnosticLog('SUCCESS', '🎤 Recognition started!', 'Speak clearly into your microphone')
      startMicrophoneVisualization()
    }

    recognition.onresult = (event) => {
      addDiagnosticLog('SUCCESS', `📝 Results received!`, `${event.results.length} result(s)`)
      
      let finalText = ''
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript
        addDiagnosticLog('INFO', `Text detected: "${text}"`, result.isFinal ? 'Final' : 'Interim')
        if (result.isFinal) {
          finalText += text + ' '
        }
      }
      
      if (finalText) {
        addDiagnosticLog('SUCCESS', `✅ Added to transcript!`, `"${finalText.trim()}"`)
        setTranscript(prev => prev + finalText)
      }
    }

    recognition.onerror = (event) => {
      addDiagnosticLog('ERROR', `Recognition error: ${event.error}`, 'See troubleshooting below')
      
      if (event.error === 'not-allowed') {
        setError('Microphone access denied. Tap 🔒 → Allow microphone')
      } else if (event.error === 'no-speech') {
        addDiagnosticLog('WARNING', 'No speech detected', 'Try speaking louder or check microphone')
      } else if (event.error === 'audio-capture') {
        setError('No microphone found. Please connect a microphone.')
      }
    }

    recognition.onend = () => {
      addDiagnosticLog('INFO', 'Recognition session ended', 'Click Start again to continue')
      setIsListening(false)
      stopMicrophoneVisualization()
    }

    recognition.onsoundstart = () => {
      addDiagnosticLog('SUCCESS', '🔊 Sound detected!', 'Processing your speech...')
    }

    recognition.onspeechend = () => {
      addDiagnosticLog('INFO', 'Speech ended', 'Transcribing...')
    }

    return recognition
  }, [selectedLanguage, startMicrophoneVisualization, stopMicrophoneVisualization])

  useEffect(() => {
    recognitionRef.current = initRecognition()
    addDiagnosticLog('INFO', 'App ready', 'Tap Start Listening to begin')
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort()
      stopMicrophoneVisualization()
    }
  }, [initRecognition, stopMicrophoneVisualization])

  const startListening = async () => {
    setError('')
    setTranscript('')
    addDiagnosticLog('INFO', 'Start button pressed', 'Requesting microphone permission...')
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      addDiagnosticLog('SUCCESS', 'Microphone permission granted', 'Starting recognition...')
      recognitionRef.current.start()
      setIsListening(true)
    } catch (err) {
      addDiagnosticLog('ERROR', 'Microphone permission failed', err.message)
      setError(`Microphone error: ${err.message}. Tap the 🔒 icon and allow microphone access.`)
    }
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
    setIsListening(false)
    addDiagnosticLog('INFO', 'Stopped by user', 'Recognition ended')
  }

  const clearText = () => {
    setTranscript('')
    addDiagnosticLog('INFO', 'Text cleared', 'Transcript reset')
  }

  const clearLogs = () => {
    setDiagnosticLogs([])
    addDiagnosticLog('INFO', 'Logs cleared', 'Diagnostic history reset')
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
      <p className="subtitle">Android Diagnostic Mode - Visual Console</p>

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

      {/* Visual Console - For Android (replaces F12) */}
      <div className="visual-console">
        <div className="console-header">
          <strong>📱 Visual Console (Live Diagnostics)</strong>
          <button onClick={clearLogs} className="console-clear">Clear</button>
        </div>
        <div className="console-logs">
          {diagnosticLogs.length === 0 ? (
            <div className="console-empty">Tap "Start Listening" to begin diagnostics...</div>
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
        Status: {isListening ? 'Listening...' : 'Idle'}
        <span className="language-badge">{languages.find(l => l.code === selectedLanguage)?.name || selectedLanguage}</span>
      </div>

      <div className="transcript-container">
        <h3>Recognized Text:</h3>
        <div className="transcript-box">{transcript || 'Press Start and speak...'}</div>
      </div>

      <div className="info">
        <p>📱 <strong>Android Troubleshooting:</strong></p>
        <ol>
          <li><strong>Microphone level bar moving?</strong> → Your mic is working!</li>
          <li><strong>See "✅ Results received" in console?</strong> → API is working!</li>
          <li><strong>See "❌ no-speech" error?</strong> → Speak louder or check mic</li>
          <li><strong>No "✅ Results received"?</strong> → Google servers not responding (network issue)</li>
          <li><strong>Permission denied?</strong> → Tap 🔒 in address bar → Allow microphone</li>
        </ol>
        <p className="note">💡 The visual console above shows everything that would appear in F12 on desktop!</p>
      </div>
    </div>
  )
}

export default App