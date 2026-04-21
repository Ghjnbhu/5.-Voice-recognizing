import React, { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')
  const [microphoneLevel, setMicrophoneLevel] = useState(0)
  const [selectedLanguage, setSelectedLanguage] = useState('en-US')
  const [recognitionStatus, setRecognitionStatus] = useState('')
  const recognitionRef = useRef(null)
  const audioContextRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const analyserNodeRef = useRef(null)
  const animationFrameRef = useRef(null)
  const restartTimeoutRef = useRef(null)
  const isAndroid = /Android/i.test(navigator.userAgent)

  // Language options
  const languages = [
    { code: 'en-US', name: 'English (US)' },
    { code: 'en-GB', name: 'English (UK)' },
    { code: 'es-ES', name: 'Español' },
    { code: 'fr-FR', name: 'Français' },
    { code: 'de-DE', name: 'Deutsch' },
    { code: 'it-IT', name: 'Italiano' },
    { code: 'pt-BR', name: 'Português' },
    { code: 'ru-RU', name: 'Русский' },
    { code: 'ja-JP', name: '日本語' },
    { code: 'ko-KR', name: '한국어' },
    { code: 'zh-CN', name: '中文' },
    { code: 'hi-IN', name: 'हिन्दी' },
  ]

  // Update microphone level visualization
  const updateMicrophoneLevel = () => {
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
  }

  // Start microphone for level visualization
  const startMicrophoneVisualization = async () => {
    try {
      // Don't create a new stream if we already have one
      if (mediaStreamRef.current && mediaStreamRef.current.active) {
        return
      }
      
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
      console.error('Microphone visualization error:', err)
    }
  }

  const stopMicrophoneVisualization = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error)
      audioContextRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }
    analyserNodeRef.current = null
    setMicrophoneLevel(0)
  }

  // Initialize speech recognition with auto-restart
  const initRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setError('Speech recognition not supported')
      return null
    }

    const recognition = new SpeechRecognition()
    // Critical: Use continuous=false for reliable auto-restart on Android
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = selectedLanguage
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      console.log('Recognition started')
      setRecognitionStatus('🎤 Listening... Speak now')
      setError('')
      startMicrophoneVisualization()
    }

    recognition.onresult = (event) => {
      console.log('Result received:', event.results)
      let finalText = ''

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript
        
        if (result.isFinal) {
          finalText += text + ' '
          console.log('Final:', text)
        } else {
          // Show interim results in status
          setRecognitionStatus(`🎤 Hearing: "${text}"`)
        }
      }

      if (finalText) {
        setTranscript(prev => prev + finalText)
        setRecognitionStatus('✅ Captured! Listening for more...')
      }
    }

    recognition.onerror = (event) => {
      console.error('Recognition error:', event.error)
      
      switch (event.error) {
        case 'no-speech':
          // Don't show error for no-speech, just update status
          setRecognitionStatus('🎤 No speech detected, still listening...')
          break
        case 'audio-capture':
          setError('No microphone found.')
          setRecognitionStatus('Microphone error')
          setIsListening(false)
          stopMicrophoneVisualization()
          break
        case 'not-allowed':
          setError('Microphone access denied. Please check Chrome permissions.')
          setRecognitionStatus('Permission denied')
          setIsListening(false)
          stopMicrophoneVisualization()
          break
        case 'network':
          setError('Network error. Please check your connection.')
          setRecognitionStatus('Network error')
          setIsListening(false)
          stopMicrophoneVisualization()
          break
        default:
          if (event.error !== 'aborted') {
            setError(`Error: ${event.error}`)
            setIsListening(false)
            stopMicrophoneVisualization()
          }
      }
    }

    recognition.onend = () => {
      console.log('Recognition ended, isListening:', isListening)
      
      // CRITICAL WORKAROUND: Auto-restart if we're still supposed to be listening
      if (isListening) {
        console.log('Auto-restarting recognition...')
        setRecognitionStatus('🔄 Restarting mic...')
        
        // Clear any pending restart
        if (restartTimeoutRef.current) {
          clearTimeout(restartTimeoutRef.current)
        }
        
        // Delay restart to prevent browser throttling
        restartTimeoutRef.current = setTimeout(() => {
          if (isListening && recognitionRef.current) {
            try {
              recognitionRef.current.start()
            } catch (err) {
              console.error('Auto-restart failed:', err)
              // If restart fails, stop listening state
              setIsListening(false)
              stopMicrophoneVisualization()
              setError('Could not restart microphone. Please click Start again.')
              setRecognitionStatus('Failed to restart')
            }
          }
        }, 300) // 300ms delay helps prevent issues
      } else {
        setRecognitionStatus('Stopped')
        stopMicrophoneVisualization()
      }
    }

    recognition.onsoundstart = () => {
      console.log('Sound detected')
      setRecognitionStatus('🔊 Sound detected! Transcribing...')
    }

    recognition.onsoundend = () => {
      console.log('Sound ended')
      setRecognitionStatus('⏸️ Processing speech...')
    }

    recognition.onspeechstart = () => {
      console.log('Speech started')
      setRecognitionStatus('📝 Transcribing your words...')
    }

    recognition.onspeechend = () => {
      console.log('Speech ended')
      setRecognitionStatus('✍️ Capturing...')
    }

    return recognition
  }

  useEffect(() => {
    // Check browser support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Speech recognition not supported in this browser')
      return
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Your browser does not support microphone access.')
      return
    }

    // Initialize recognition
    recognitionRef.current = initRecognition()

    // Cleanup on unmount
    return () => {
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current)
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch (e) {}
      }
      stopMicrophoneVisualization()
    }
  }, [])

  // Re-initialize when language changes
  useEffect(() => {
    if (recognitionRef.current) {
      const wasListening = isListening
      if (wasListening) {
        // Temporarily stop listening
        const oldRecognition = recognitionRef.current
        recognitionRef.current = initRecognition()
        try {
          oldRecognition.abort()
        } catch (e) {}
        // Restart after a delay
        setTimeout(() => {
          if (wasListening && recognitionRef.current) {
            try {
              recognitionRef.current.start()
            } catch (err) {
              console.error('Failed to restart after language change:', err)
              setIsListening(false)
            }
          }
        }, 500)
      } else {
        recognitionRef.current = initRecognition()
      }
    }
  }, [selectedLanguage])

  const startListening = async () => {
    if (!recognitionRef.current) {
      recognitionRef.current = initRecognition()
    }

    // Clear any existing restart timeout
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current)
    }

    setError('')
    setRecognitionStatus('🎤 Requesting microphone...')
    
    try {
      // Request microphone permission first
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Keep the stream for visualization, but recognition will use its own
      
      // Start recognition
      recognitionRef.current.start()
      setIsListening(true)
    } catch (err) {
      console.error('Permission error:', err)
      if (err.name === 'NotAllowedError') {
        setError('Microphone access denied. Tap the 🔒 icon in address bar → Allow microphone → Refresh')
      } else if (err.name === 'NotFoundError') {
        setError('No microphone found on this device')
      } else {
        setError(`Cannot access microphone: ${err.message}`)
      }
      setIsListening(false)
      setRecognitionStatus('Failed to start')
    }
  }

  const stopListening = () => {
    setIsListening(false)
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current)
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) {
        console.error('Stop error:', e)
      }
    }
    setRecognitionStatus('Stopped')
  }

  const clearText = () => {
    setTranscript('')
  }

  const getLevelColor = () => {
    if (microphoneLevel < 20) return '#4caf50'
    if (microphoneLevel < 50) return '#8bc34a'
    if (microphoneLevel < 80) return '#ff9800'
    return '#f44336'
  }

  return (
    <div className="container">
      <h1>🎙️ Voice Recognition</h1>
      <p className="subtitle">Continuous dictation - just keep speaking!</p>

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      {/* Language Selection */}
      <div className="language-selector">
        <label>🌍 Language:</label>
        <select
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value)}
          disabled={isListening}
          className="language-dropdown"
        >
          {languages.map(lang => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
        {isAndroid && (
          <span className="android-badge">📱 Auto-restart mode active</span>
        )}
      </div>

      {/* Microphone Level Bar */}
      <div className={`microphone-level-container ${isListening ? 'active' : ''}`}>
        <div className="level-label">
          <span>🎤 Microphone Level</span>
          <span className="level-percentage">
            {isListening ? `${microphoneLevel}%` : '—%'}
          </span>
        </div>
        <div className="level-bar-bg">
          <div 
            className="level-bar-fill"
            style={{ 
              width: isListening ? `${microphoneLevel}%` : '0%',
              backgroundColor: getLevelColor(),
              transition: 'width 0.05s linear'
            }}
          />
        </div>
        {isListening && (
          <div className="recognition-status">
            <span className="status-dot"></span>
            {recognitionStatus}
          </div>
        )}
      </div>

      {/* Buttons */}
      <div className="button-group">
        <button 
          onClick={startListening} 
          disabled={isListening}
          className="btn btn-start"
        >
          🎤 Start Listening
        </button>
        
        <button 
          onClick={stopListening} 
          disabled={!isListening}
          className="btn btn-stop"
        >
          ⏹️ Stop
        </button>
        
        <button 
          onClick={clearText}
          className="btn btn-clear"
        >
          🗑️ Clear
        </button>
      </div>

      <div className="status">
        <span className="status-icon">{isListening ? '🔴' : '⚪'}</span>
        Status: {isListening ? 'Listening (auto-restarting)' : 'Idle'}
        <span className="language-badge">
          {languages.find(l => l.code === selectedLanguage)?.name || selectedLanguage}
        </span>
      </div>

      {/* Transcript */}
      <div className="transcript-container">
        <h3>Recognized Text:</h3>
        <div className="transcript-box">
          {transcript || 'Press "Start Listening" and just keep speaking...'}
        </div>
      </div>

      {/* Instructions */}
      <div className="info">
        <p>💡 How it works:</p>
        <ul>
          <li>✅ <strong>Just keep speaking</strong> - The mic restarts automatically!</li>
          <li>🎤 The microphone level bar shows your input volume</li>
          <li>🔄 Recognition restarts after each phrase (you won't notice)</li>
          <li>📱 Works continuously on Android and desktop</li>
          <li>🔊 Speak clearly - the app transcribes as you go</li>
        </ul>
        <p className="note">
          {isAndroid 
            ? "📱 On Android: The mic icon may blink briefly between phrases - that's normal!"
            : "💻 On desktop: Works continuously without interruption!"}
        </p>
      </div>
    </div>
  )
}

export default App