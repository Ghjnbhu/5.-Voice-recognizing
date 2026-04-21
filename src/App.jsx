import React, { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

function App() {
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')
  const [microphoneLevel, setMicrophoneLevel] = useState(0)
  const [selectedLanguage, setSelectedLanguage] = useState('en-US')
  const [recognitionStatus, setRecognitionStatus] = useState('')
  const [restartCount, setRestartCount] = useState(0)
  
  const recognitionRef = useRef(null)
  const audioContextRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const analyserNodeRef = useRef(null)
  const animationFrameRef = useRef(null)
  const restartTimeoutRef = useRef(null)
  const shouldRestartRef = useRef(false)
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

  // Start microphone visualization
  const startMicrophoneVisualization = useCallback(async () => {
    try {
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
  }, [updateMicrophoneLevel])

  const stopMicrophoneVisualization = useCallback(() => {
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
  }, [])

  // Core: Smart restart function that mimics dictation.io
  const restartRecognition = useCallback(() => {
    if (!shouldRestartRef.current) return
    
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current)
    }
    
    restartTimeoutRef.current = setTimeout(() => {
      if (shouldRestartRef.current && recognitionRef.current) {
        try {
          console.log('🔄 Auto-restarting recognition...')
          setRecognitionStatus('🎤 Restarting microphone...')
          recognitionRef.current.start()
          setRestartCount(prev => prev + 1)
        } catch (err) {
          console.error('❌ Auto-restart failed:', err)
          // Silently retry after a bit longer
          if (shouldRestartRef.current) {
            restartTimeoutRef.current = setTimeout(() => {
              if (shouldRestartRef.current && recognitionRef.current) {
                try {
                  recognitionRef.current.start()
                } catch (e) {
                  console.error('❌ Second restart attempt failed:', e)
                  // Give up and let user restart manually
                  shouldRestartRef.current = false
                  setIsListening(false)
                  setRecognitionStatus('❌ Mic failed - click Start again')
                }
              }
            }, 1000)
          }
        }
      }
    }, 50) // Super fast restart - like dictation.io
  }, [])

  // Initialize speech recognition
  const initRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setError('Speech recognition not supported')
      return null
    }

    const recognition = new SpeechRecognition()
    // Critical: Use continuous=false for reliable restarts on Android
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = selectedLanguage
    recognition.maxAlternatives = 1

    // Handle results - accumulate text smoothly
    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript
        
        if (result.isFinal) {
          finalText += text + ' '
          console.log('✅ Final:', text)
        } else {
          interimText += text
          console.log('📝 Interim:', text)
        }
      }

      if (finalText) {
        setTranscript(prev => prev + finalText)
        setRecognitionStatus('✨ Captured! Listening for more...')
      } else if (interimText) {
        setRecognitionStatus(`🎤 "${interimText}"`)
      }
    }

    // Handle start
    recognition.onstart = () => {
      console.log('🎙️ Recognition started')
      setRecognitionStatus('🎤 Listening... Speak now')
      setError('')
      startMicrophoneVisualization()
    }

    // Handle end - THIS IS THE CRITICAL PART
    recognition.onend = () => {
      console.log('⏹️ Recognition ended, shouldRestart:', shouldRestartRef.current)
      
      if (shouldRestartRef.current) {
        // Silently restart - this is what dictation.io does
        setRecognitionStatus('🔄 Ready for more...')
        restartRecognition()
      } else {
        setRecognitionStatus('⏸️ Stopped')
        stopMicrophoneVisualization()
      }
    }

    // Handle errors - SWALLOW non-critical errors like dictation.io
    recognition.onerror = (event) => {
      console.warn('⚠️ Recognition error:', event.error)
      
      // Dictation.io swallows these errors silently
      switch (event.error) {
        case 'no-speech':
          // Don't show error - just update status quietly
          setRecognitionStatus('🎤 Waiting for speech...')
          // Still restart if needed
          if (shouldRestartRef.current) {
            restartRecognition()
          }
          break
        case 'audio-capture':
          setError('No microphone found.')
          setRecognitionStatus('❌ No mic detected')
          shouldRestartRef.current = false
          setIsListening(false)
          stopMicrophoneVisualization()
          break
        case 'not-allowed':
          setError('Microphone access denied. Tap 🔒 → Allow microphone')
          setRecognitionStatus('❌ Permission denied')
          shouldRestartRef.current = false
          setIsListening(false)
          stopMicrophoneVisualization()
          break
        case 'aborted':
          // Silent fail - just retry
          if (shouldRestartRef.current) {
            restartRecognition()
          }
          break
        default:
          // For unknown errors, don't break the experience
          console.error('Unhandled error:', event.error)
          if (shouldRestartRef.current) {
            restartRecognition()
          }
      }
    }

    // Optional: Add sound detection for better UX
    recognition.onsoundstart = () => {
      setRecognitionStatus('🔊 Detecting speech...')
    }
    
    recognition.onspeechend = () => {
      setRecognitionStatus('⚙️ Processing...')
    }

    return recognition
  }, [selectedLanguage, startMicrophoneVisualization, stopMicrophoneVisualization, restartRecognition])

  // Initialize on mount
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Speech recognition not supported in this browser')
      return
    }

    recognitionRef.current = initRecognition()

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
  }, [initRecognition, stopMicrophoneVisualization])

  // Handle language change
  useEffect(() => {
    if (recognitionRef.current) {
      const wasListening = shouldRestartRef.current
      if (wasListening) {
        // Gracefully stop
        shouldRestartRef.current = false
        try {
          recognitionRef.current.stop()
        } catch (e) {}
        
        // Create new recognition and restart
        setTimeout(() => {
          recognitionRef.current = initRecognition()
          if (wasListening) {
            shouldRestartRef.current = true
            try {
              recognitionRef.current.start()
            } catch (err) {
              console.error('Failed to restart after language change:', err)
            }
          }
        }, 200)
      } else {
        recognitionRef.current = initRecognition()
      }
    }
  }, [selectedLanguage, initRecognition])

  const startListening = async () => {
    if (!recognitionRef.current) {
      recognitionRef.current = initRecognition()
    }

    // Clear any existing state
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current)
    }
    
    setError('')
    setRecognitionStatus('🎤 Starting...')
    shouldRestartRef.current = true
    setIsListening(true)
    
    try {
      // Request permission first
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      
      recognitionRef.current.start()
    } catch (err) {
      console.error('Permission error:', err)
      shouldRestartRef.current = false
      setIsListening(false)
      
      if (err.name === 'NotAllowedError') {
        setError('Microphone access denied. Tap the 🔒 icon in address bar → Allow microphone → Refresh')
      } else if (err.name === 'NotFoundError') {
        setError('No microphone found on this device')
      } else {
        setError(`Cannot access microphone: ${err.message}`)
      }
      setRecognitionStatus('Failed to start')
    }
  }

  const stopListening = () => {
    shouldRestartRef.current = false
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
      <p className="subtitle">Just keep speaking - it never stops!</p>

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

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
          <span className="android-badge">📱 Continuous mode active</span>
        )}
        {restartCount > 0 && isListening && (
          <span className="restart-badge">🔄 Auto-restarting seamlessly</span>
        )}
      </div>

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
        Status: {isListening ? 'Continuously listening' : 'Idle'}
        <span className="language-badge">
          {languages.find(l => l.code === selectedLanguage)?.name || selectedLanguage}
        </span>
      </div>

      <div className="transcript-container">
        <h3>Recognized Text:</h3>
        <div className="transcript-box">
          {transcript || 'Press "Start Listening" and just keep speaking...'}
        </div>
      </div>

      <div className="info">
        <p>💡 How it works (like dictation.io):</p>
        <ul>
          <li>✅ <strong>Never stops</strong> - Auto-restarts silently in milliseconds</li>
          <li>🎤 <strong>Just keep speaking</strong> - No need to press buttons between phrases</li>
          <li>🔄 <strong>Seamless experience</strong> - You won't notice the restarts</li>
          <li>📱 <strong>Works on Android</strong> - Same technology as dictation.io</li>
          <li>⚡ <strong>Ultra-fast restart</strong> - Only 50ms delay between captures</li>
        </ul>
        <p className="note">
          {isAndroid 
            ? "📱 On Android: The mic icon may flicker briefly - that's the auto-restart working perfectly!"
            : "💻 On desktop: Works continuously without any interruption!"}
        </p>
      </div>
    </div>
  )
}

export default App