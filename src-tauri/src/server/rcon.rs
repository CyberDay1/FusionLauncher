use crate::error::LauncherError;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

/// Minecraft RCON client implementation.
/// Protocol: https://wiki.vg/RCON
pub struct RconClient {
    stream: TcpStream,
    request_id: i32,
}

#[repr(i32)]
enum PacketType {
    Response = 0,
    Command = 2,
    Login = 3,
}

impl RconClient {
    /// Connects to an RCON server and authenticates.
    pub fn connect(host: &str, port: u16, password: &str) -> Result<Self, LauncherError> {
        let addr = format!("{}:{}", host, port);
        let stream = TcpStream::connect_timeout(
            &addr.parse().map_err(|e: std::net::AddrParseError| LauncherError::Other(e.to_string()))?,
            Duration::from_secs(5),
        )?;
        stream.set_read_timeout(Some(Duration::from_secs(10)))?;

        let mut client = RconClient {
            stream,
            request_id: 1,
        };

        // Authenticate
        let response = client.send_packet(PacketType::Login, password)?;
        if response.request_id == -1 {
            return Err(LauncherError::Other("RCON authentication failed".to_string()));
        }

        Ok(client)
    }

    /// Sends a command and returns the response.
    pub fn send_command(&mut self, command: &str) -> Result<String, LauncherError> {
        let response = self.send_packet(PacketType::Command, command)?;
        Ok(response.payload)
    }

    fn send_packet(&mut self, ptype: PacketType, payload: &str) -> Result<RconPacket, LauncherError> {
        let request_id = self.request_id;
        self.request_id += 1;

        // Build packet: length (4) + request_id (4) + type (4) + payload + \0 + \0
        let payload_bytes = payload.as_bytes();
        let packet_length = 4 + 4 + payload_bytes.len() + 2; // id + type + payload + 2 nulls

        let mut packet = Vec::with_capacity(4 + packet_length);
        packet.extend_from_slice(&(packet_length as i32).to_le_bytes());
        packet.extend_from_slice(&request_id.to_le_bytes());
        packet.extend_from_slice(&(ptype as i32).to_le_bytes());
        packet.extend_from_slice(payload_bytes);
        packet.push(0); // payload null terminator
        packet.push(0); // padding null

        self.stream.write_all(&packet)?;
        self.stream.flush()?;

        // Read response
        let mut length_buf = [0u8; 4];
        self.stream.read_exact(&mut length_buf)?;
        let response_length = i32::from_le_bytes(length_buf) as usize;

        let mut response_buf = vec![0u8; response_length];
        self.stream.read_exact(&mut response_buf)?;

        let resp_id = i32::from_le_bytes([
            response_buf[0], response_buf[1], response_buf[2], response_buf[3]
        ]);
        let resp_type = i32::from_le_bytes([
            response_buf[4], response_buf[5], response_buf[6], response_buf[7]
        ]);
        let resp_payload = String::from_utf8_lossy(&response_buf[8..response_length - 2]).to_string();

        Ok(RconPacket {
            request_id: resp_id,
            packet_type: resp_type,
            payload: resp_payload,
        })
    }
}

struct RconPacket {
    request_id: i32,
    packet_type: i32,
    payload: String,
}
