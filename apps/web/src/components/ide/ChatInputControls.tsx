'use client';

import React, { useEffect } from 'react';
import { useVoiceStore } from '@/stores/voice.store';
import { sttService } from '@/lib/stt.service';
import { Mic, MicOff } from 'lucide-react';

// A simple toggle switch component
function ToggleSwitch({ enabled, onChange }: { enabled: boolean, onChange: (enabled: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${enabled ? 'bg-indigo-600' : 'bg-gray-600'}`}>
      <span
        className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 ease-in-out ${enabled ? 'translate-x-6' : 'translate-x-1'}`}/>
    </button>
  );
}

export default function ChatInputControls() {
  const { 
      isTTSEnabled, 
      toggleTTSEnabled,
      isListening,
      setTranscript,
      appendFinalTranscript,
      clearTranscripts,
  } = useVoiceStore();

  useEffect(() => {
    sttService.onResult = (final, interim) => {
        setTranscript(final, interim);
    };

    return () => {
        sttService.onResult = null;
    }
  }, [setTranscript]);

  const handleToggleListening = () => {
    sttService.toggleListening();
  };

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-gray-800/50 border-t border-gray-700">
      <div className="flex items-center gap-2">
        <label htmlFor="tts-toggle" className="text-sm font-medium text-gray-300">Speak Responses</label>
        <ToggleSwitch enabled={isTTSEnabled} onChange={toggleTTSEnabled} />
      </div>
      <button 
        onClick={handleToggleListening}
        className="p-2 rounded-full text-gray-300 hover:bg-gray-700 transition-colors"
        aria-label={isListening ? 'Stop listening' : 'Start listening'}
      >
        {isListening ? <MicOff size={20} /> : <Mic size={20} />}
      </button>
    </div>
  );
}
