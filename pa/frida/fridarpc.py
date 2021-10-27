import frida, sys

def on_message(msg, data):
    if msg["type"] == "send":
        print("Send: {}".format(msg["payload"]))
    else:
        print(msg)

device = frida.get_usb_device()
process = device.attach("fridacli")

jscode = '''
    function getdata() {
        Java.perform(function() {
            var MainActivity = Java.use("com.lambdax.fridacli.MainActivity")
            MainActivity.thisisastaticsecret()

            Java.choose("com.lambdax.fridacli.MainActivity", {
            onMatch: function(instance) {
                console.log("Lambdax.frida: instance found", instance)
                console.log("string => ", instance.prefix.value)
            },
            onComplete: function() {
                console.log("Lambdax.frida: search complete")
            }
            })
        })
    }
    function callsec() {
        Java.perform(function() {
            var MainActivity = Java.use("com.lambdax.fridacli.MainActivity")

            Java.choose("com.lambdax.fridacli.MainActivity", {
            onMatch: function(instance) {
                console.log("Lambdax.frida: instance found", instance)
                instance.thisisasecret()
            },
            onComplete: function() {
                console.log("Lambdax.frida: search complete")
            }
            })
        })
    }
    rpc.exports = {  // 导出
        getdata: getdata,
        callsec: callsec
    };
'''

script = process.create_script(jscode)
script.on("message", on_message)
script.load()

cmd = ""
while True:
    cmd = input(">")
    if cmd == "get":
        script.exports.getdata()
    elif cmd == "call":
        script.exports.callsec()