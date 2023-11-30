import React, {useState, useEffect, useRef} from 'react';
import io from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';

const Broadcaster = () => {
  const [roomName, setRoomName] = useState("")

  let socket;
  let stream;
  let track;
  let rtpCapabilities;
  let device;
  let producerTransport;
  let producer;
  let isProducer = false;

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

  const videoRef = useRef(null);


  const streamSuccess = (stream) => {
    videoRef.current.srcObject = stream;
    const track = stream.getVideoTracks()[0]
    params = {
      track,
      ...params
    }
  
    goConnect(true)
  }

  const goConnect = (producerOrConsumer) => {
    isProducer = producerOrConsumer
    device === undefined ? getRTPCapabilities() : goCreateTransport()
  }
  
  const goCreateTransport = () => {
    createSendTransport()
  }


  const startScreenShare = async () => {
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      }).then(streamSuccess)
      .catch(error => {
        console.log(error.message)
      })
      // if (videoRef.current) {
      //   videoRef.current.srcObject = stream;
      //   track = stream.getVideoTracks()[0]
      //   if(track){
      //     params = {
      //       track,
      //       ...params
      //     }
      //   }
      //   // await getRTPCapabilities();
      // }
    } catch (error) {
      console.error("Error: Could not get display media: ", error);
    }
  };

  
  const getRTPCapabilities = async ()=>{
      // make a request to the server for Router RTP Capabilities
      // see server's socket.on('getRtpCapabilities', ...)
      // the server sends back data object which contains rtpCapabilities
      try{
        socket.emit('getRtpCapabilities',{ broadcaster:true , roomName }, (data) => {
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


  const createSendTransport = () => {
    // see server's socket.on('createWebRtcTransport', sender?, ...)
    // this is a call from Producer, so sender = true
    socket.emit('createWebRtcTransport', { sender: true }, ({ params }) => {
      // The server sends back params needed 
      // to create Send Transport on the client side
      if (params.error) {
        console.log(params.error)
        return
      }
  
      console.log(params)
  
      // creates a new WebRTC Transport to send media
      // based on the server's producer transport params
      // https://mediasoup.org/documentation/v3/mediasoup-client/api/#TransportOptions
      producerTransport = device.createSendTransport(params)

      // https://mediasoup.org/documentation/v3/communication-between-client-and-server/#producing-media
      // this event is raised when a first call to transport.produce() is made
      // see connectSendTransport() below
      producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          // Signal local DTLS parameters to the server side transport
          // see server's socket.on('transport-connect', ...)
          await socket.emit('transport-connect', {
            dtlsParameters,
          })

          // Tell the transport that parameters were transmitted.
          callback()
  
        } catch (error) {
          errback(error)
        }
      })
  
      producerTransport.on('produce', async (parameters, callback, errback) => {
        console.log(parameters)
  
        try {
          // tell the server to create a Producer
          // with the following parameters and produce
          // and expect back a server side producer id
          // see server's socket.on('transport-produce', ...)
          await socket.emit('transport-produce', {
            kind: parameters.kind,
            rtpParameters: parameters.rtpParameters,
            appData: parameters.appData,
          }, ({ id }) => {
            // Tell the transport that parameters were transmitted and provide it with the
            // server side producer's id.
            callback({ id })
          })
        } catch (error) {
          errback(error)
        }
      })
      connectSendTransport()
    })
    // await connectSendTransport();
    // connectSendTransport(); 
  }

  const connectSendTransport = async () => {
    // we now call produce() to instruct the producer transport
    // to send media to the Router
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
    // this action will trigger the 'connect' and 'produce' events above
    producer = await producerTransport.produce(params)
  
    producer.on('trackended', () => {
      console.log('track ended')
  
      // close video track
    })
  
    producer.on('transportclose', () => {
      console.log('transport ended')
  
      // close video track
    })
  }


  return (
    <div>
      <h1>Broadcaster Page</h1>
      <p>This is the about page content.</p>
      <input
        type="text"
        id="roomName"
        value={roomName}
        onChange={(e)=>setRoomName(e.target.value)}
      />
      <video id='localVideo' ref={videoRef} autoPlay playsInline></video>
      <button onClick={startScreenShare}>Publish</button>
      {/* <button onClick={startScreenShare}>Share</button>      
      <button onClick={getRTPCapabilities}>RTP Capabilities</button>
      <button onClick={createDevice}>Create Device</button>
      <button onClick={createSendTransport}>Create Send Transport</button>
      <button onClick={connectSendTransport}>Connect Send Transport</button> */}
    </div>
  );
};

export default Broadcaster;
