import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';
import { Notyf } from 'notyf';
import 'notyf/notyf.min.css';
import '../App.css'
import clipboardCopy from 'clipboard-copy';
import Helpers from '../Helpers/Helpers';
import { EmailIcon, FacebookIcon, WhatsappIcon, FacebookShareButton, EmailShareButton, WhatsappShareButton } from 'react-share'

const Broadcaster = () => {
  const [shareUrl, setShareUrl] = useState("")
  const [roomName, setRoomName] = useState("")
  const [desciption, setDescription] = useState("")
  const [heading, setHeading] = useState("Set the Room Name")
  const [videoDisplay, setVideoDisplay] = useState("none")
  const [otherElementDisplay, setOtherElementDisplay] = useState("block")
  const [joinButtonDisplay, setJoinButtonDisplay] = useState("inline")
  const [exitButtonDisplay, setExitButtonDisplay] = useState("none")
  const [socket, setSocket] = useState(null)
  const [placeholder, setPlaceholder] = useState("https:/")
  const [noDisplayMobileScreen, setNoDisplayMobileScreen] = useState("noDisplayMobileScreen")
  const notyf = new Notyf();
  // let socket;
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
    if (!track) {
      setNoDisplayMobileScreen("")
    }
    let socket;
    socket = io(`${Helpers.server}`);
    socket.on('connection-success', ({ socketId }) => {
      // console.log(socketId);
    });
    setSocket(socket);
  }, [roomName, desciption]);

  const videoRef = useRef(null);


  const streamSuccess = (stream) => {
    videoRef.current.srcObject = stream;
    track = stream.getVideoTracks()[0]
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
          notyf.error("An Error Occurred")
          // console.log(error.message)
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
      // console.error("Error: Could not get display media: ", error);
      notyf.error("Cannot Display Media, Please Try Again")
    }
  };


  const getRTPCapabilities = async () => {
    // make a request to the server for Router RTP Capabilities
    // see server's socket.on('getRtpCapabilities', ...)
    // the server sends back data object which contains rtpCapabilities
    try {
      socket.emit('getRtpCapabilities', { broadcaster: true, roomName, desciption }, (data) => {
        // console.log(desciption);
        // console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`)

        // we assign to local variable and will be used when
        // loading the client Device (see createDevice above)
        rtpCapabilities = data.rtpCapabilities
        createDevice()
      })
    } catch (error) {
      // console.log(error)
      notyf.error("Cannot Display Media, Please Try Again")
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
      // console.log('RTP Capabilities', device.rtpCapabilities)
      goCreateTransport()
    } catch (error) {
      // console.log(error)
      notyf.error("Error While Producing Streams, Please Try Again")
      if (error.name === 'UnsupportedError')
        console.warn('browser not supported')
      notyf.error("Browser Doesn't support this app")
    }
  }


  const createSendTransport = () => {
    // see server's socket.on('createWebRtcTransport', sender?, ...)
    // this is a call from Producer, so sender = true
    socket.emit('createWebRtcTransport', { sender: true }, ({ params }) => {
      // The server sends back params needed 
      // to create Send Transport on the client side
      if (params.error) {
        // console.log(params.error)
        notyf.error("Error While creating Transport ")
        return
      }

      // console.log(params)

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
          notyf.error("Error While Connecting")
        }
      })

      producerTransport.on('produce', async (parameters, callback, errback) => {
        // console.log(parameters)

        try {
          setHeading(roomName)
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
          setVideoDisplay("flex")
          setExitButtonDisplay("")
          setOtherElementDisplay("none")
          setJoinButtonDisplay("none")
          setExitButtonDisplay("inline")
          
      
          setPlaceholder(`${Helpers.copyLink}/room/${roomName}`)
          setShareUrl(`${Helpers.copyLink}/room/${roomName}`)
          console.log(shareUrl)
        } catch (error) {
          notyf.error("Kindly Try Again")
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

    if (track) {
      setNoDisplayMobileScreen("noDisplayMobileScreen")
    }

    producer.on('trackended', () => {
      // console.log('track ended')
      socket.emit("tracksEnded", `Tracks ended for room Named: ${roomName}`)
      window.location.reload();
    })

    producer.on('transportclose', () => {
      // console.log('transport ended')
      socket.emit("tracksEnded", `Tracks ended for room Named: ${roomName}`)
    })

  }

  const endStream = async () => {
    socket.emit("tracksEnded", `Tracks ended for room Named: ${roomName}`);
    window.location.reload();
  }

  const copy = () => {
    try {
      console.log(shareUrl)

      clipboardCopy(`${Helpers.copyLink}/room/${roomName}`)
        .then(() => {
          notyf.success("Copied to Clipboard")
        })
        .catch((err) => {
          notyf.error("An Error Occured")
        });
    } catch (err) {
      console.log(err)
    }
  }

  return (
    <div style={{ width: "100%" }} className='centered-row height mx-auto pt-2 flex-row container-fluid'>
      <div
        className='m-2 px-2 py-5 rowMobileView fullWidthMobile justify-content-center align-items-center'
        style={{
          display: videoDisplay,
          boxShadow: "5px 5px 10px rgba(0, 0, 0, 0.3)",
          backgroundColor: "rgb(255,255,255,0.4)",
          height: "70vh",
          borderRadius: "20px",
          width: "80%"
        }} >
          <div
          className='flex-column displayOnlyMobileScreen'
          style={{
            display: videoDisplay,
            backgroundColor: "rgba(255,255,255,0.1)",
            position: "absolute",
            top: "0%",
            width: "70%",
            borderRadius: "20px"
          }}
        >
          <div className='d-flex flex-row justify-content-center align-items-center'>
            <input
              value={placeholder}
              disabled
              style={{ backgroundColor: "rgba(255,255,255,0)", border: "none", color: "white" }}
            ></input>
          </div>
          <div className='d-flex flex-row justify-content-center align-items-center'>
            <FacebookShareButton url={shareUrl}>
              <FacebookIcon className='p-1 m-1' size={50}></FacebookIcon>
            </FacebookShareButton>
            <EmailShareButton url={shareUrl}>
              <EmailIcon className='p-1 m-1' size={50} round></EmailIcon>
            </EmailShareButton>
            <WhatsappShareButton url={shareUrl}>
              <WhatsappIcon className='p-1 m-1' size={50} round />
            </WhatsappShareButton>
            <button
              className='btn btn-dark m-2 p-2 '
              onClick={copy}
            >Copy</button>
          </div>
        </div>
        <h1 className='heading displayOnlyMobileScreen'>{heading}</h1>
        <video
          className='videoHeight'
          style={{ maxWidth: "100%" }}
          id='localVideo'
          ref={videoRef}
          autoPlay
          playsInline></video>
        <button
          style={{ display: exitButtonDisplay, background: "linear-gradient(90deg, hsla(318, 44%, 51%, 1), hsla(347, 94%, 48%, 1))", border: "none" }}
          className={`btn btn-success m-2 p-2 displayOnlyMobileScreen`}
          onClick={endStream}
        >Stop Streaming
        </button>
      </div>
      <div className={`card text-center m-2 blur p-2 centered-row width-form ${noDisplayMobileScreen}`}
        style={{ boxShadow: "5px 5px 10px rgba(0, 0, 0, 0.3)", backgroundColor: "rgb(255,255,255,0.4)", height: "70vh" }}>

        <div
          className='flex-column'
          style={{
            display: videoDisplay,
            backgroundColor: "rgba(255,255,255,0.1)",
            position: "absolute",
            top: "5%",
            width: "70%",
            borderRadius: "20px"
          }}
        >
          <div className='d-flex flex-row justify-content-center align-items-center'>
            <input
              value={placeholder}
              disabled
              style={{ backgroundColor: "rgba(255,255,255,0)", border: "none", color: "white" }}
            ></input>
          </div>
          <div>
            <FacebookShareButton  url={shareUrl}>
              <FacebookIcon className='p-1 m-1' style={{ borderRadius: "50%" }} size={50}></FacebookIcon>
            </FacebookShareButton>
            <EmailShareButton  url={shareUrl}>
              <EmailIcon className='p-1 m-1' style={{ borderRadius: "50%" }} size={50}></EmailIcon>
            </EmailShareButton>
            <WhatsappShareButton url={shareUrl}>
              <WhatsappIcon className='p-1 m-1' size={50} round />
            </WhatsappShareButton>
            <button
              className='btn btn-dark m-2 p-2 '
              onClick={copy}
            >Copy</button>
          </div>
        </div>


        <h1 className='heading'>{heading}</h1>
        <p className='text' style={{ display: videoDisplay }}>{desciption}</p>
        <div className='px-3' style={{ textAlign: "left", width: "100%" }}>
          <label style={{ display: otherElementDisplay }} for="exampleInputEmail1" className="form-label text m-1">Stream Name</label>
          <input
            style={{ display: otherElementDisplay }}
            type="text"
            id="roomName"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            className="input form-control m-1"
            placeholder="Room Name"
            aria-label="Room Name"
            aria-describedby="basic-addon1"
            autoComplete='off'
          />
          <label style={{ display: otherElementDisplay }} for="exampleInputEmail1" className="form-label text m-1">Stream Description</label>
          <input
            style={{ display: otherElementDisplay }}
            type="text"
            id="description"
            value={desciption}
            onChange={(e) => setDescription(e.target.value)}
            className="form-control m-1 input"
            placeholder="Room Description"
            aria-label="description"
            aria-describedby="basic-addon1"
            autoComplete='off'
          />
        </div>
        <button
          style={{ display: joinButtonDisplay, background: "linear-gradient(90deg, hsla(318, 44%, 51%, 1), hsla(347, 94%, 48%, 1))", border: "none" }}
          className='btn btn-success m-2 p-2 w-25'
          onClick={startScreenShare}
        >
          Start Stream
        </button>

        <button
          style={{ display: exitButtonDisplay, background: "linear-gradient(90deg, hsla(318, 44%, 51%, 1), hsla(347, 94%, 48%, 1))", border: "none" }}
          className='btn btn-success m-2 p-2'
          onClick={endStream}
        >Stop Streaming
        </button>
      </div>
    </div>
  );
};

export default Broadcaster;
