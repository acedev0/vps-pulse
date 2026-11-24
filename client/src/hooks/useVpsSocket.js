import { useState, useEffect, useRef } from 'react';

export function useVpsSocket() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('connecting'); // 'connecting' | 'connected' | 'disconnected'
  const [demoMode, setDemoMode] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  useEffect(() => {
    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;

      setStatus('connecting');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          setData(payload);
          if (payload.demoMode !== undefined) {
            setDemoMode(payload.demoMode);
          }
        } catch (e) {
          console.error('Failed to parse frame:', e);
        }
      };

      ws.onerror = () => {
        setStatus('disconnected');
      };

      ws.onclose = () => {
        setStatus('disconnected');
        // Auto-reconnect after 2 seconds
        reconnectTimeoutRef.current = setTimeout(connect, 2000);
      };
    }

    connect();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  const toggleDemo = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const next = !demoMode;
      setDemoMode(next);
      wsRef.current.send(JSON.stringify({ type: 'toggle_demo', value: next }));
    }
  };

  return { data, status, demoMode, toggleDemo };
}
