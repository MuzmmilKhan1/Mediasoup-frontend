import React, {useState, useEffect, useRef} from 'react';
import io from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';
import 'bootstrap/dist/css/bootstrap.min.css';
import { useNavigate } from 'react-router-dom'
import { Notyf } from 'notyf';
import 'notyf/notyf.min.css';
import { GrNext } from "react-icons/gr";
import Helpers from '../Helpers/Helpers';

export default function Consume() {
  const [socket, setSocket] = useState(null)
  const [roomName, setRoomName] = useState("")
  const [description, setDescription] = useState("");
  const [rooms, setRooms] = useState([])
  const [viewerName, setViewerName] = useState("")
  const [heading, setHeading] = useState("Select the Stream to Play")
  const [videoDisplay, setVideoDisplay] = useState("none")
  const [videoElementDisplay, setVideoElementDisplay] = useState("none")
  const [otherElementDisplay, setOtherElementDisplay] = useState("flex")
  const [joinButtonDisplay, setJoinButtonDisplay] = useState("inline")
  const [exitButtonDisplay, setExitButtonDisplay] = useState("none")
  const navigate = useNavigate();
  const notyf = new Notyf();

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
      let socket;
      socket = io(`${Helpers.server}`);
      socket.on('connection-success', ({ socketId }) => {
        // console.log(socketId);
      });
      socket.on("producerDisconnected", (data)=>{
        // console.log(data)
        remoteVideo.current.srcObject = null
        notyf.success("Stream Has been Ended")
        window.location.reload();
      })
      setSocket(socket);
    }, [roomName]);

    useEffect(()=>{
      let socket;
      socket = io(`${Helpers.server}`);
      socket.on("newUser", (data)=>{
        // console.log("Routers ",data)
        setRooms(Object.values(data))
        if (Object.keys(data).length === 0) {
          setHeading("No Streams to Watch")
        }
      })
      setSocket(socket)
    }, [remoteVideo])


    // useEffect(()=>{
    //   let socket;
    //   socket = io('https://127.0.0.1:8000');
    //   socket.on("noroom", data=>{
    //     console.log(data)
    //   })
    //   setSocket(socket);
    // })
      
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
            
            // we assign to local variable and will be used when
            // loading the client Device (see createDevice above)
            if(data == null){
              notyf.error("Stream has been ended or Doesn't Exists")
              window.history.reload();
            }
            if(data != null){
              // console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`)
              rtpCapabilities = data.rtpCapabilities
              createDevice()
            }
          })
        }catch(error){
          // console.log(error)
          notyf.error("An Error Occured, Try Again")
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
        notyf.error("An Error Occured, Try Again")
        if (error.name === 'UnsupportedError')
          console.warn('browser not supported')
          notyf.error("Your Browser Doesn't support Streaming")
      }
    }
      
      const createRecvTransport = async () => {
        // see server's socket.on('consume', sender?, ...)
        // this is a call from Consumer, so sender = false
        await socket.emit('createWebRtcTransport', { sender: false }, ({ params }) => {
          // The server sends back params needed 
          // to create Send Transport on the client side
          if (params.error) {
            notyf.error("An Error Occured While Creating a Connection, Try Again")
            // console.log(params.error)
            return
          }
      
          // console.log("Create Web RTC transport ",params)
      
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
              // console.log(error)
              notyf.error("An Error Occured, Try Again")
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
            notyf.error("An Error Occured, Try Again")
            // console.log('Cannot Consume')
            return
          }
      
          // console.log("Consume",params)
          // then consume with the local consumer transport
          // which creates a consumer
          consumer = await consumerTransport.consume({
            id: params.id,
            producerId: params.producerId,
            kind: params.kind,
            rtpParameters: params.rtpParameters
          })
      
          // destructure and retrieve the video track from the producer
          setVideoDisplay("block")
          setJoinButtonDisplay("none")
          setExitButtonDisplay("inline")
          const { track } = consumer
          // console.log(track)
          remoteVideo.current.srcObject = new MediaStream([track])
      
          // the server consumer started with media paused
          // so we need to inform the server to resume
          socket.emit('consumer-resume')
        })
      }

      const joinRoom = (room, desc) => {
        setHeading(room)
        setDescription(desc)
        setVideoElementDisplay("flex")
        setOtherElementDisplay("none")
        let b = 0
        if(b <= 1){
          // goConsume();  // Fix: Add parentheses to call the function
          b++;
        }
      }

      const exitRoom = ()=>{
        window.location.reload();
      }
      

  return (
    <div style={{
      width:"100%",
      // height: "100vh"
    }} className='d-flex flex-column justify-content-center align-items-center mx-auto'>
    <h1 className='heading  pt-2' style={{display: otherElementDisplay}}>{heading}</h1>
    <div 
    style={{
      display: videoElementDisplay,
      width: "100%",
      height: "100vh"
    }}  
    className="justify-content-center flex-row align-items-center"
    >
    <div className='blur card fullWidthMobile centered-row mx-2' 
    style={{
      boxShadow: "5px 5px 10px rgba(0, 0, 0, 0.3)", 
      backgroundColor: "rgb(255,255,255,0.4)",
      height: "70vh",
      width: "70%"
    }}
    >
    <h1 className='heading displayOnlyMobileScreen'>{heading}</h1>
    <video
    id='remoteVideo' 
    ref={remoteVideo} 
    autoPlay playsInline 
    style={{
    maxWidth: "100%",
    height: "70vh",
    display: videoDisplay, 
    borderRadius: '20px'
    }}
    controls
    className='p-2'
    ></video>
    <button 
  style={{display: joinButtonDisplay, background: "linear-gradient(90deg, hsla(318, 44%, 51%, 1), hsla(347, 94%, 48%, 1))", border: "none"}}
  className='btn btn-success m-2 p-2 w-25' 
    onClick={goConsume}>Play</button>
    <button 
    style={{display: exitButtonDisplay, background: "linear-gradient(90deg, hsla(318, 44%, 51%, 1), hsla(347, 94%, 48%, 1))", border: "none"}}
    className='btn btn-success m-2 p-2 w-25 displayOnlyMobileScreen' 
    onClick={exitRoom}>Stop Stream</button>
    </div>
    
    <div className='blur card centered-row mx-2 noDisplayMobileScreen' 
    style={{
      boxShadow: "5px 5px 10px rgba(0, 0, 0, 0.3)", 
      backgroundColor: "rgb(255,255,255,0.4)",
      height: "70vh",
      width: "30%"
    }}>
      <h1 className='heading'>{heading}</h1>
      <p className='text'>{description}</p>
      <button 
    style={{display: exitButtonDisplay, background: "linear-gradient(90deg, hsla(318, 44%, 51%, 1), hsla(347, 94%, 48%, 1))", border: "none"}}
    className='btn btn-success m-2 p-2 w-25' 
    onClick={exitRoom}>Stop Stream</button>
    </div>

    </div>

    <div style={{display: otherElementDisplay, width: "100%"}} className='p-5 row justify-content-evenly'>
    {rooms.map((room)=>{
      return(
      <div
      key={room.roomId}
      // className={`d-flex flex-row justify-content-between align-items-center p-5 col-md-3 border rounded m-auto my-1`}
      className={`d-flex flex-row justify-content-between align-items-center col-md-3 blur card p-5 my-3 scale`}
      style={{boxShadow: "5px 5px 10px rgba(0, 0, 0, 0.3)", backgroundColor: "rgb(255,255,255,0.4)"}}
      onClick={()=>{setRoomName(room.room); joinRoom(room.room, room.description)}}
      >
        <div className='d-flex flex-column justif-content-center align-items-start '>
          <h5 className='heading'>{room.room}</h5>
          <p 
          className='text'
          >{room.producerId}</p>
        </div>
        <GrNext className="" style={{color: "white", fontWeight: "bolder"}} />
      </div>
    );
  })}
  </div>
    </div>
  )
}
