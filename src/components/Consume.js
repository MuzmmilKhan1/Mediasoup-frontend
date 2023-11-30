import React, {useState, useEffect, useRef} from 'react';
import io from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';

export default function Consume() {
  const [roomName, setRoomName] = useState("")

    let socket;
    let rtpCapabilities;
    let device;
    let consumer;
    let consumerTransport;
    const remoteVideo = useRef(null);
  
    let params = {
      // mediasoup params
      encodings: [
        {
          rid: 'r0',
          maxBitrate: 100000,
          scalabilityMode: 'S1T3',
        },
        {
          rid: 'r1',
          maxBitrate: 300000,
          scalabilityMode: 'S1T3',
        },
        {
          rid: 'r2',
          maxBitrate: 900000,
          scalabilityMode: 'S1T3',
        },
      ],
      // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
      codecOptions: {
        videoGoogleStartBitrate: 1000
      }
    }
  
    useEffect(() => {
      socket = io('https://safetixstreaming.com/');
      socket.on('connection-success', ({ socketId }) => {
        console.log(socketId);
      });
    }, [roomName]);
  

    const goConsume = () => {
      goConnect(false)
    }
    
    const goConnect = () => {
      device === undefined ? getRTPCapabilities() : goCreateTransport()
    }
    
    const goCreateTransport = () => {
       createRecvTransport()
    }

    const videoRef = useRef(null);

    const getRTPCapabilities = async ()=>{
        // make a request to the server for Router RTP Capabilities
        // see server's socket.on('getRtpCapabilities', ...)
        // the server sends back data object which contains rtpCapabilities
        try{
          socket.emit('getRtpCapabilities',{  broadcaster:false ,roomName }, (data) => {
            console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`)
            
            // we assign to local variable and will be used when
            // loading the client Device (see createDevice above)
            rtpCapabilities = data.rtpCapabilities
            createDevice()
          })
        }catch(error){
          console.log(error)
        }
    }
  
    const createDevice = async () => {
      try {
        device = new mediasoupClient.Device()
    
        // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-load
        // Loads the device with RTP capabilities of the Router (server side)
        await device.load({
          // see getRtpCapabilities() below
          routerRtpCapabilities: rtpCapabilities
        })
    
        console.log('RTP Capabilities', device.rtpCapabilities)
        goCreateTransport()
      } catch (error) {
        console.log(error)
        if (error.name === 'UnsupportedError')
          console.warn('browser not supported')
      }
    }
      
      const createRecvTransport = async () => {
        // see server's socket.on('consume', sender?, ...)
        // this is a call from Consumer, so sender = false
        await socket.emit('createWebRtcTransport', { sender: false }, ({ params }) => {
          // The server sends back params needed 
          // to create Send Transport on the client side
          if (params.error) {
            console.log(params.error)
            return
          }
      
          console.log("Create Web RTC transport ",params)
      
          // creates a new WebRTC Transport to receive media
          // based on server's consumer transport params
          // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-createRecvTransport
          consumerTransport = device.createRecvTransport(params)
      
          // https://mediasoup.org/documentation/v3/communication-between-client-and-server/#producing-media
          // this event is raised when a first call to transport.produce() is made
          // see connectRecvTransport() below
          consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
              // Signal local DTLS parameters to the server side transport
              // see server's socket.on('transport-recv-connect', ...)
              await socket.emit('transport-recv-connect', {
                dtlsParameters,
              })
      
              // Tell the transport that parameters were transmitted.
              callback()
            } catch (error) {
              console.log(error)
              // Tell the transport that something was wrong
              errback(error)
            }
          })
          connectRecvTransport()
        })
      }

      
      const connectRecvTransport = async () => {
        // for consumer, we need to tell the server first
        // to create a consumer based on the rtpCapabilities and consume
        // if the router can consume, it will send back a set of params as below
        await socket.emit('consume', {
          rtpCapabilities: device.rtpCapabilities,
        }, async ({ params }) => {
          if (params.error) {
            console.log('Cannot Consume')
            return
          }
      
          console.log("Consume",params)
          // then consume with the local consumer transport
          // which creates a consumer
          consumer = await consumerTransport.consume({
            id: params.id,
            producerId: params.producerId,
            kind: params.kind,
            rtpParameters: params.rtpParameters
          })
      
          // destructure and retrieve the video track from the producer
          const { track } = consumer
          console.log(track)
          remoteVideo.current.srcObject = new MediaStream([track])
      
          // the server consumer started with media paused
          // so we need to inform the server to resume
          socket.emit('consumer-resume')
        })
      }
  

  return (
    <div>      
    <h1>Consumer Page</h1>
    <p>This is the about page content.</p>
    <input
        type="text"
        id="roomName"
        value={roomName}
        onChange={(e)=>setRoomName(e.target.value)}
      />
    <video id='remoteVideo' ref={remoteVideo} autoPlay playsInline></video>
    <button onClick={goConsume}>Consume</button>
    {/* <button onClick={getRTPCapabilities}>Get RTC Capabilities</button>
    <button onClick={createDevice}>Create Device</button>
    <button onClick={createRecvTransport}>Connect Receive Transport</button>
    <button onClick={connectRecvTransport}>Receive</button> */}

    </div>
  )
}
