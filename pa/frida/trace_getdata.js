/*
 * Auto-generated by Frida. Please modify to match the signature of remote_register_buf_attr.
 * This stub is currently auto-generated from manpages when available.
 *
 * For full API reference, see: http://www.frida.re/docs/javascript-api/
 */

{
  /**
   * Called synchronously when about to call remote_register_buf_attr.
   *
   * @this {object} - Object allowing you to store state for use in onLeave.
   * @param {function} log - Call this function with a string to be presented to the user.
   * @param {array} args - Function arguments represented as an array of NativePointer objects.
   * For example use args[0].readUtf8String() if the first argument is a pointer to a C string encoded as UTF-8.
   * It is also possible to modify arguments by assigning a NativePointer object to an element of this array.
   * @param {object} state - Object allowing you to keep state across function calls.
   * Only one JavaScript function will execute at a time, so do not worry about race-conditions.
   * However, do not use this to store function arguments across onEnter/onLeave, but instead
   * use "this" which is an object for keeping state local to an invocation.
   */
  onEnter: function (log, args, state) {

    if(args[2] == 0xffffffff) console.log("DEL: ", args[1], args[0]);
    else console.log("ADD: ", args[1], args[0]);

  },

  /**
   * Called synchronously when about to return from remote_register_buf_attr.
   *
   * See onEnter for details.
   *
   * @this {object} - Object allowing you to access state stored in onEnter.
   * @param {function} log - Call this function with a string to be presented to the user.
   * @param {NativePointer} retval - Return value represented as a NativePointer object.
   * @param {object} state - Object allowing you to keep state across function calls.
   */
  onLeave: function (log, retval, state) {
    function buf2hex(buffer) { 
      const byteArray = new Uint8Array(buffer);
      const hexParts = [];
      for(i = 0;  i < byteArray.length;i++) {
        const hex = byteArray[i].toString(16);
        const paddedHex = ('00' + hex).slice(-2);
        hexParts.push(paddedHex);
      }
      return hexParts;
    }

    //cat /proc/$(ps -A | grep -w imageclassifiers8 | awk -F ' ' '{print $2}')/maps | grep libcdsprpc | head -n 1 | awk -F '-' '{print $1}'
    var baseaddr = 0x73aefa4000;
    var headnode = baseaddr + 0x40130;

    var node = buf2hex(Memory.readByteArray(ptr(headnode), 32));;
    prev = node.slice(0, 8).reverse().join("");
    pnext = node.slice(8, 16).reverse().join("");
    buf = node.slice(16, 24).reverse().join("");
    len = node.slice(24, 28).reverse().join("");
    fd = node.slice(28, 32).reverse().join("");

    console.log("[CURR]: ", headnode.toString(16), ", [prev]: ", prev, ", [pnext]: ", pnext, ", [buf]: ", buf, ", [len]: ", len, ", [fd]:", fd);

    while((pnext = parseInt(pnext, 16)) != headnode) {
      var node = buf2hex(Memory.readByteArray(ptr(pnext), 32));
      currnode = pnext.toString(16);
      prev = node.slice(0, 8).reverse().join("");
      pnext = node.slice(8, 16).reverse().join("");
      buf = node.slice(16, 24).reverse().join("");
      len = node.slice(24, 28).reverse().join("");
      fd = node.slice(28, 32).reverse().join("");
      console.log("[CURR]: ", currnode, ", [prev]: ", prev, ", [pnext]: ", pnext, ", [buf]: ", buf, ", [len]: ", len, ", [fd]:", fd);
    }

    console.log("\n");
  }
}