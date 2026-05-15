"use client";

import { useState, useEffect, useRef } from "react";
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Peer, { MediaConnection } from "peerjs";
import { toast } from "sonner";

interface VoiceCallProps {
  currentUserId: string;
  targetUserId: string;
  targetUserName: string;
  targetUserImage?: string;
  isIncoming: boolean;
  onClose: () => void;
  onSendSignal: (type: "accept" | "reject" | "hangup") => void;
  incomingSignal?: "accept" | "reject" | "hangup" | null;
}

export function VoiceCall({
  currentUserId,
  targetUserId,
  targetUserName,
  targetUserImage,
  isIncoming,
  onClose,
  onSendSignal,
  incomingSignal
}: VoiceCallProps) {
  const [peer, setPeer] = useState<Peer | null>(null);
  const [callStatus, setCallStatus] = useState<"calling" | "ringing" | "connecting" | "connected" | "ended">(isIncoming ? "ringing" : "calling");
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [duration, setDuration] = useState(0);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isPeerReady, setIsPeerReady] = useState(false);
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const peerInstanceRef = useRef<Peer | null>(null);

  useEffect(() => {
    const sanitizedId = currentUserId.replace(/[^a-zA-Z0-9_-]/g, "_");

    const newPeer = new Peer(sanitizedId, {
      debug: 1,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun3.l.google.com:19302" },
          { urls: "stun:stun4.l.google.com:19302" },
          { urls: "stun:stun.l.google.com:19305" },
          { urls: "stun:stun1.l.google.com:19305" },
          { urls: "stun:stun2.l.google.com:19305" },
          { urls: "stun:stun3.l.google.com:19305" },
          { urls: "stun:stun4.l.google.com:19305" },
          { urls: "stun:global.stun.twilio.com:3478" },
          { urls: "stun:stun.services.mozilla.com" }
        ]
      }
    });

    peerInstanceRef.current = newPeer;

    newPeer.on("open", (id) => {
      console.log("My peer ID is: " + id);
      setIsPeerReady(true);
      if (!isIncoming) {
        void startPeerCall();
      }
    });

    newPeer.on("call", (call) => {
      console.log("Incoming PeerJS call from:", call.peer);
      callRef.current = call;
    });

    newPeer.on("error", (err) => {
      console.error("Peer error:", err);
      if (err.type === "peer-unavailable") {
        toast.error("User is offline or unavailable");
        endCall(false);
      } else if (err.type === "unavailable-id") {
        toast.error("You are already in a call session");
        endCall(false);
      }
    });

    setPeer(newPeer);

    return () => {
      if (callRef.current) {
        callRef.current.close();
      }
      newPeer.destroy();
      stopMedia();
    };
  }, []);

  const stopMedia = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
  };

  const startPeerCall = async () => {
    if (!peerInstanceRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      localStreamRef.current = stream;

      const sanitizedTargetId = targetUserId.replace(/[^a-zA-Z0-9_-]/g, "_");
      const outgoingCall = peerInstanceRef.current.call(sanitizedTargetId, stream);

      if (!outgoingCall) {
        toast.error("Failed to start voice call");
        setCallStatus("ended");
        setTimeout(onClose, 2000);
        return;
      }

      callRef.current = outgoingCall;
      handleCall(outgoingCall);
    } catch (err) {
      console.error("Failed to get local stream", err);
      toast.error("Microphone access denied. Please check permissions.");
      setCallStatus("ended");
      setTimeout(onClose, 2000);
    }
  };

  const acceptCall = async () => {
    setCallStatus("connecting");
    onSendSignal("accept");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      localStreamRef.current = stream;

      if (callRef.current) {
        callRef.current.answer(stream);
        handleCall(callRef.current);
      } else {
        peerInstanceRef.current?.on("call", (incomingCall) => {
          callRef.current = incomingCall;
          incomingCall.answer(stream);
          handleCall(incomingCall);
        });
      }
    } catch (err) {
      console.error("Failed to get local stream", err);
      toast.error("Microphone access denied.");
      endCall(true);
    }
  };

  const handleCall = (call: MediaConnection) => {
    call.on("stream", (remoteMediaStream) => {
      console.log("Received remote stream");
      setRemoteStream(remoteMediaStream);
      setCallStatus("connected");
    });

    call.on("close", () => {
      setCallStatus("ended");
      setTimeout(onClose, 1500);
    });

    call.on("error", (err) => {
      console.error("Call error:", err);
      setCallStatus("ended");
      setTimeout(onClose, 1500);
    });
  };

  useEffect(() => {
    if (remoteStream && remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.muted = !isSpeakerOn;

      const play = () => {
        if (!remoteAudioRef.current) return;

        remoteAudioRef.current.play().then(() => {
          setIsAudioBlocked(false);
        }).catch((e) => {
          console.warn("Autoplay blocked:", e);
          setIsAudioBlocked(true);
        });
      };
      play();
    }
  }, [remoteStream, isSpeakerOn]);

  const handleContainerClick = () => {
    if (isAudioBlocked && remoteAudioRef.current) {
      remoteAudioRef.current.play().then(() => {
        setIsAudioBlocked(false);
      }).catch((err) => {
        console.error("Manual play failed:", err);
      });
    }
  };

  useEffect(() => {
    if (!incomingSignal) return;

    if (incomingSignal === "accept") {
      if (!isIncoming && (callStatus === "calling" || callStatus === "connecting")) {
        setCallStatus("connecting");
      }
    } else if (incomingSignal === "reject" || incomingSignal === "hangup") {
      setCallStatus("ended");
      setTimeout(onClose, 1500);
    }
  }, [incomingSignal, isIncoming, callStatus, onClose]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (callStatus === "connected") {
      interval = setInterval(() => setDuration((prev) => prev + 1), 1000);
    }
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [callStatus]);

  const endCall = (sendSignal: boolean = true) => {
    if (sendSignal) onSendSignal("hangup");
    if (callRef.current) callRef.current.close();
    setCallStatus("ended");
    setTimeout(onClose, 1000);
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] h-[100dvh]"
      onClick={handleContainerClick}
      data-peer-ready={isPeerReady}
      data-peer-id={peer?.id ?? ""}
    >
      <div className="bg-background border rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col items-center justify-between p-6 md:p-10 min-h-[500px] max-h-[90vh] animate-in zoom-in duration-300">
        <audio ref={remoteAudioRef} autoPlay playsInline className="opacity-0 pointer-events-none absolute w-px h-px overflow-hidden" />

        <div className="flex flex-col items-center gap-6 md:gap-8 w-full">
          <div className="relative mt-4">
            <div className={`absolute -inset-6 md:-inset-8 rounded-full bg-primary/10 animate-ping ${callStatus !== "connected" && callStatus !== "ended" ? "opacity-100" : "opacity-0"}`} />
            <Avatar className={`h-24 w-24 md:h-28 md:w-28 border-4 transition-colors ${callStatus === "connected" ? "border-green-500" : "border-primary/20"}`}>
              <AvatarImage src={targetUserImage} />
              <AvatarFallback className="text-2xl md:text-3xl font-bold bg-primary/5">{targetUserName[0]}</AvatarFallback>
            </Avatar>
          </div>

          <div className="text-center space-y-1 md:space-y-2 w-full px-4">
            <h3 className="text-xl md:text-2xl font-bold truncate">{targetUserName}</h3>
            <p className="text-[10px] md:text-sm font-medium text-muted-foreground uppercase tracking-widest">
              {callStatus === "ringing" ? "Incoming call" :
               callStatus === "calling" ? "Calling..." :
               callStatus === "connecting" ? "Connecting..." :
               callStatus === "connected" ? formatDuration(duration) :
               "Call ended"}
            </p>
            {isAudioBlocked && callStatus === "connected" && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 bg-primary/10 border-primary text-primary hover:bg-primary/20 animate-pulse"
                onClick={() => {
                  remoteAudioRef.current?.play().catch(() => undefined);
                  setIsAudioBlocked(false);
                }}
              >
                <Volume2 className="h-4 w-4 mr-2" />
                Enable Audio
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 md:gap-8 w-full pb-4">
          {callStatus === "ringing" ? (
            <div className="flex items-center gap-8 md:gap-12">
              <div className="flex flex-col items-center gap-2">
                <Button size="icon" variant="destructive" className="h-16 w-16 md:h-20 md:w-20 rounded-full shadow-lg active:scale-90 transition-transform" onClick={() => endCall(true)}>
                  <PhoneOff className="h-7 w-7 md:h-8 md:w-8" />
                </Button>
                <span className="text-[10px] font-bold uppercase opacity-60">Decline</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Button size="icon" className="h-16 w-16 md:h-20 md:w-20 rounded-full bg-green-500 hover:bg-green-600 shadow-lg animate-bounce active:scale-90 transition-transform" onClick={acceptCall}>
                  <Phone className="h-7 w-7 md:h-8 md:w-8" />
                </Button>
                <span className="text-[10px] font-bold uppercase opacity-60">Accept</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 items-center gap-4 md:gap-8 w-full max-w-[280px]">
              <div className="flex flex-col items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className={`h-12 w-12 md:h-14 md:w-14 rounded-full active:scale-90 transition-transform ${isMuted ? "bg-destructive/10 border-destructive" : ""}`}
                  onClick={toggleMute}
                  disabled={callStatus === "ended"}
                >
                  {isMuted ? <MicOff className="h-5 w-5 md:h-6 md:w-6 text-destructive" /> : <Mic className="h-5 w-5 md:h-6 md:w-6" />}
                </Button>
                <span className="text-[9px] font-bold uppercase opacity-50">{isMuted ? "Unmute" : "Mute"}</span>
              </div>

              <div className="flex flex-col items-center gap-2">
                <Button size="icon" variant="destructive" className="h-16 w-16 md:h-20 md:w-20 rounded-full shadow-xl hover:scale-105 active:scale-95 transition-transform" onClick={() => endCall(true)}>
                  <PhoneOff className="h-8 w-8 md:h-10 md:w-10" />
                </Button>
                <span className="text-[9px] font-bold uppercase opacity-50">End</span>
              </div>

              <div className="flex flex-col items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className={`h-12 w-12 md:h-14 md:w-14 rounded-full active:scale-90 transition-transform ${isSpeakerOn ? "bg-primary/10 border-primary" : ""}`}
                  onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                  disabled={callStatus === "ended"}
                >
                  {isSpeakerOn ? <Volume2 className="h-5 w-5 md:h-6 md:w-6 text-primary" /> : <VolumeX className="h-5 w-5 md:h-6 md:w-6" />}
                </Button>
                <span className="text-[9px] font-bold uppercase opacity-50">Speaker</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}