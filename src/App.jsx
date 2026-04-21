import React, { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'  // ← CSS import added

function App() {
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')
  const [microphoneLevel, setMicrophoneLevel] = useState(0)
  const [selectedLanguage, setSelectedLanguage] = useState('en-US')
  const [diagnosticInfo, setDiagnosticInfo] = useState('')
  const recognitionRef = useRef(null)
  const audioContextRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const analyserNodeRef = useRef(null)
  const animationFrameRef = useRef(null)

  const languages = [
    { code: 'en-US', name: 'English (US)' },
    { code: 'es-ES', name: 'Español' },
    { code: 'fr-FR', name: 'Français' },
  ]

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

  // Initialize speech recognition with diagnostic logging
  const initRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setError('Speech recognition not supported')
      return null
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = selectedLanguage

    recognition.onstart = () => {
      console.log('🔵 EVENT: onstart - Recognition started')
      setDiagnosticInfo('Recognition started - waiting for speech...')
      startMicrophoneVisualization()
    }

    recognition.onresult = (event) => {
      console.log('🟢 EVENT: onresult - RESULTS RECEIVED!', event)
      console.log(`📊 Number of results: ${event.results.length}`)
      setDiagnosticInfo(`Results received! ${event.results.length} result(s)`)
      
      let finalText = ''
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript
        console.log(`  Result ${i}: "${text}" (isFinal: ${result.isFinal})`)
        if (result.isFinal) {
          finalText += text + ' '
        }
      }
      
      if (finalText) {
        console.log(`✅ Adding to transcript: "${finalText}"`)
        setTranscript(prev => prev + finalText)
      }
    }

    recognition.onerror = (event) => {
      console.error(`🔴 EVENT: onerror - ${event.error}`)
      setDiagnosticInfo(`ERROR: ${event.error}`)
      if (event.error === 'not-allowed') {
        setError('Microphone access denied')
      } else if (event.error === 'no-speech') {
        setDiagnosticInfo('No speech detected - keep speaking!')
      }
    }

    recognition.onend = () => {
      console.log('⚪ EVENT: onend - Recognition ended')
      setDiagnosticInfo('Recognition ended')
      setIsListening(false)
      stopMicrophoneVisualization()
    }

    recognition.onsoundstart = () => {
      console.log('🟡 EVENT: onsoundstart - Sound detected!')
      setDiagnosticInfo('Sound detected! Transcribing...')
    }

    recognition.onspeechend = () => {
      console.log('🟡 EVENT: onspeechend - Speech ended')
      setDiagnosticInfo('Speech ended, processing...')
    }

    return recognition
  }, [selectedLanguage, startMicrophoneVisualization, stopMicrophoneVisualization])

  useEffect(() => {
    recognitionRef.current = initRecognition()
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort()
      stopMicrophoneVisualization()
    }
  }, [initRecognition, stopMicrophoneVisualization])

  const startListening = async () => {
    setError('')
    setTranscript('')
    setDiagnosticInfo('Requesting microphone...')
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      recognitionRef.current.start()
      setIsListening(true)
    } catch (err) {
      setError(`Microphone error: ${err.message}`)
    }
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }

  const clearText = () => setTranscript('')

  const getLevelColor = () => {
    if (microphoneLevel < 20) return '#4caf50'
    if (microphoneLevel < 50) return '#8bc34a'
    if (microphoneLevel < 80) return '#ff9800'
    return '#f44336'
  }

  return (
    <div className="container">
      <h1>🎙️ Voice Recognition</h1>
      <p className="subtitle">DIAGNOSTIC MODE - Check console (F12)</p>

      {error && <div className="error-message">⚠️ {error}</div>}

      <div className="language-selector">
        <label>🌍 Language:</label>
        <select value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)} disabled={isListening}>
          {languages.map(lang => (<option key={lang.code} value={lang.code}>{lang.name}</option>))}
        </select>
      </div>

      <div className="diagnostic-box">
        <strong>🔧 Diagnostic Status:</strong>
        <div className="diagnostic-text">{diagnosticInfo || 'Waiting for action...'}</div>
        <div className="diagnostic-hint">Open browser console (F12) to see detailed logs</div>
      </div>

      <div className="microphone-level-container">
        <div className="level-label">
          <span>🎤 Microphone Level</span>
          <span>{isListening ? `${microphoneLevel}%` : '—%'}</span>
        </div>
        <div className="level-bar-bg">
          <div className="level-bar-fill" style={{ width: isListening ? `${microphoneLevel}%` : '0%', backgroundColor: getLevelColor() }} />
        </div>
      </div>

      <div className="button-group">
        <button onClick={startListening} disabled={isListening} className="btn btn-start">🎤 Start Listening</button>
        <button onClick={stopListening} disabled={!isListening} className="btn btn-stop">⏹️ Stop</button>
        <button onClick={clearText} className="btn btn-clear">🗑️ Clear</button>
      </div>

      <div className="transcript-container">
        <h3>Recognized Text:</h3>
        <div className="transcript-box">{transcript || 'Press Start and speak...'}</div>
      </div>

      <div className="info">
        <p>📋 <strong>How to diagnose:</strong></p>
        <ol>
          <li>Press <strong>F12</strong> to open browser console</li>
          <li>Click <strong>Start Listening</strong> and speak</li>
          <li>Watch the console for colored events:
            <ul>
              <li>🔵 onstart - Recognition started</li>
              <li>🟡 onsoundstart - Your voice is detected</li>
              <li>🟢 onresult - Google returned text (THIS IS WHAT WE NEED)</li>
              <li>🔴 onerror - Something went wrong</li>
            </ul>
          </li>
          <li>If you see 🟢 onresult with text, the API works and your code is fine</li>
          <li>If you see only 🟡 but no 🟢, Google's servers aren't responding</li>
        </ol>
      </div>
    </div>
  )
}

export default App