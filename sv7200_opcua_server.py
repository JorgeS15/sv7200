#opc-ua server v1.1.2 - Robust version with error handling
import sys
import traceback

try:
    from opcua import ua, Server
    print("✓ OPC-UA library imported successfully")
except ImportError as e:
    print(f"✗ Error importing opcua library: {e}")
    print("Install with: pip install opcua")
    input("Press Enter to exit...")
    sys.exit(1)

try:
    from flask import Flask, request, jsonify
    print("✓ Flask library imported successfully")
except ImportError as e:
    print(f"✗ Error importing Flask: {e}")
    print("Install with: pip install flask")
    input("Press Enter to exit...")
    sys.exit(1)

import threading
import time

def main():
    try:
        print("Starting OPC-UA Server initialization...")
        
        # Initialize OPC-UA Server with proper configuration
        server = Server()
        server.set_endpoint("opc.tcp://0.0.0.0:4840/freeopcua/server/")
        
        # Set server properties
        server.set_server_name("SV7200 OPC-UA Server")
        server.set_security_policy([ua.SecurityPolicyType.NoSecurity])
        
        # Configure namespace
        uri = "http://sv7200.opcua.server"
        idx = server.register_namespace(uri)
        print(f"✓ Namespace registered: {uri} (index: {idx})")
        
        objects = server.get_objects_node()
        
        # Create device object with proper node ID
        sv7200 = objects.add_object(ua.NodeId("SV7200", idx), "SV7200")
        print("✓ SV7200 object created")
        
        # Define temperature with essential attributes only
        temp_var = sv7200.add_variable(ua.NodeId("Temperature", idx), "Temperature", ua.Variant(0.0, ua.VariantType.Float))
        temp_var.set_writable()
        
        # Set essential attributes for temperature
        temp_var.set_attribute(ua.AttributeIds.AccessLevel, ua.DataValue(ua.AccessLevel.CurrentRead | ua.AccessLevel.CurrentWrite))
        temp_var.set_attribute(ua.AttributeIds.UserAccessLevel, ua.DataValue(ua.AccessLevel.CurrentRead | ua.AccessLevel.CurrentWrite))
        print("✓ Temperature variable created and configured")
        
        # Define flow with essential attributes only
        flow_var = sv7200.add_variable(ua.NodeId("Flow", idx), "Flow", ua.Variant(0.0, ua.VariantType.Float))
        flow_var.set_writable()
        
        # Set essential attributes for flow
        flow_var.set_attribute(ua.AttributeIds.AccessLevel, ua.DataValue(ua.AccessLevel.CurrentRead | ua.AccessLevel.CurrentWrite))
        flow_var.set_attribute(ua.AttributeIds.UserAccessLevel, ua.DataValue(ua.AccessLevel.CurrentRead | ua.AccessLevel.CurrentWrite))
        print("✓ Flow variable created and configured")
        
        def run_opcua():
            try:
                server.start()
                print("✓ OPC-UA Server started at opc.tcp://0.0.0.0:4840")
                # Keep the server running but don't block with infinite loop
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                print("Shutting down OPC-UA server...")
            except Exception as e:
                print(f"✗ OPC-UA Server error: {e}")
                traceback.print_exc()
            finally:
                try:
                    server.stop()
                    print("✓ OPC-UA Server stopped")
                except:
                    pass
        
        # Start OPC-UA server in a separate thread
        opcua_thread = threading.Thread(target=run_opcua, daemon=True)
        opcua_thread.start()
        
        # Give the OPC-UA server a moment to start
        time.sleep(3)
        print("✓ OPC-UA server thread started")
        
        # Initialize Flask app
        app = Flask(__name__)
        
        @app.route('/update', methods=['POST'])
        def update():
            try:
                data = request.get_json()
                if data is None:
                    print("✗ No JSON data received")
                    return jsonify({'error': 'No JSON data received'}), 400
                    
                temp = float(data.get("temperature", 0.0))
                flow = float(data.get("flow", 0.0))
                
                # Update OPC-UA variables
                temp_var.set_value(ua.Variant(temp, ua.VariantType.Float))
                flow_var.set_value(ua.Variant(flow, ua.VariantType.Float))
                
                print(f"✓ Updated OPC-UA variables -> Temp: {temp}°C, Flow: {flow} L/min")
                return jsonify({'status': 'success', 'temperature': temp, 'flow': flow}), 200
                
            except Exception as e:
                error_msg = f"Error updating variables: {e}"
                print(f"✗ {error_msg}")
                traceback.print_exc()
                return jsonify({'error': error_msg}), 500
        
        @app.route('/status', methods=['GET'])
        def status():
            try:
                temp = temp_var.get_value()
                flow = flow_var.get_value()
                return jsonify({
                    'temperature': temp,
                    'flow': flow,
                    'status': 'running',
                    'opcua_endpoint': 'opc.tcp://0.0.0.0:4840/freeopcua/server/',
                    'namespace_uri': uri,
                    'namespace_index': idx
                })
            except Exception as e:
                error_msg = f"Error reading status: {e}"
                print(f"✗ {error_msg}")
                return jsonify({'error': error_msg}), 500
        
        @app.route('/', methods=['GET'])
        def home():
            return jsonify({
                'message': 'SV7200 OPC-UA Server is running',
                'endpoints': {
                    'status': '/status',
                    'update': '/update (POST)',
                    'opcua': 'opc.tcp://0.0.0.0:4840/freeopcua/server/'
                }
            })
        
        print("✓ Flask routes configured")
        print("Starting Flask server on http://0.0.0.0:5000")
        print("=" * 50)
        print("Server is ready!")
        print("OPC-UA endpoint: opc.tcp://0.0.0.0:4840/freeopcua/server/")
        print("Web status: http://localhost:5000/status")
        print("Press Ctrl+C to stop the server")
        print("=" * 50)
        
        # Run Flask server
        app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
        
    except Exception as e:
        print(f"✗ Fatal error in main(): {e}")
        traceback.print_exc()
        input("Press Enter to exit...")
        sys.exit(1)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n✓ Server shutdown requested by user")
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        traceback.print_exc()
    finally:
        print("Server stopped.")
        input("Press Enter to exit...")