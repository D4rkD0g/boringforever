上文应该在[这里](https://github.com/D4rkD0g/boringforever/blob/main/bytenote/zsxq.txt#L15)


The library winreg[1] can be used to access registry on windows.  
reg.SetValueEx(key, 'X', 0, reg.REG_DWORD, -1337)  
`SetValueEx` could store data in the value field of an open registry key, 

In the source file of "PC/winreg.c", `Py2Reg`is called first

```
static PyObject *
winreg_SetValueEx_impl(PyObject *module, HKEY key,
                       const Py_UNICODE *value_name, PyObject *reserved,
                       DWORD type, PyObject *value)
/*[clinic end generated code: output=811b769a66ae11b7 input=900a9e3990bfb196]*/
{
    BYTE *data;
    DWORD len;

    LONG rc;

    if (!Py2Reg(value, type, &data, &len))
    ...
```

`Py2Reg` is implemented in the same file:

```
Py2Reg(PyObject *value, DWORD typ, BYTE **retDataBuf, DWORD *retDataSize)
{
    Py_ssize_t i,j;
    switch (typ) {
        case REG_DWORD:
            if (value != Py_None && !PyLong_Check(value))
                return FALSE;
            *retDataBuf = (BYTE *)PyMem_NEW(DWORD, 1);
            if (*retDataBuf == NULL){
                PyErr_NoMemory();
                return FALSE;
            }
            *retDataSize = sizeof(DWORD);
            if (value == Py_None) {
                DWORD zero = 0;
                memcpy(*retDataBuf, &zero, sizeof(DWORD));
            }
            else {
                DWORD d = PyLong_AsUnsignedLong(value);
                memcpy(*retDataBuf, &d, sizeof(DWORD));
            }
            break;
```

When the type is set with reg.REG_DWORD, `PyLong_AsUnsignedLong(value)` will change  the value's type, and then memcpy the returned value directly, without any check.  

In the Objects/longobject.c, as the comment said:

```C
/* Get a C unsigned long int from an int object.
   Returns -1 and sets an error condition if overflow occurs. */
```

If PyLong_AsUnsignedLong return -1, the -1 will be stored in the registry though the error occured


PoC:

```
import winreg as reg

key = reg.CreateKey(reg.HKEY_CURRENT_USER, 'SOFTWARE\\Classes\\r3pwn')

try:
	print("Set Subkey X: -1337")
	reg.SetValueEx(key, 'X', 0, reg.REG_DWORD, -1337)
except Exception as e:
	print("Get Subkey: ", reg.QueryValueEx(key, "X")[0])

try:
	print("Set Subkey Y: 2**33")
	reg.SetValueEx(key, 'Y', 0, reg.REG_DWORD, 2**33)
except Exception as e:
	print("Get Subkey: ", reg.QueryValueEx(key, "Y")[0])


python winreg_bug.py
Set Subkey X: -1337
Get Subkey:  4294967295
Set Subkey Y: 2**33
Get Subkey:  4294967295
```

the return value should be checked CWE252

https://ycdxsb.cn/3f2f6cef.html  
https://cwe.mitre.org/data/definitions/252.html  

可以从[codeql-cwe-coverage](https://codeql.github.com/codeql-query-help/codeql-cwe-coverage/)查看codeql的cwe覆盖情况，然后找codel源码  

https://github.com/github/codeql/blob/ef0ea247c40da805efa427a37f5213457d18f714/cpp/ql/src/Likely%20Bugs/InconsistentCallOnResult.ql  
https://github.com/github/codeql/blob/ef0ea247c40da805efa427a37f5213457d18f714/cpp/ql/src/Critical/ReturnValueIgnored.ql  
https://github.com/github/codeql/blob/ef0ea247c40da805efa427a37f5213457d18f714/cpp/ql/src/Microsoft/IgnoreReturnValueSAL.ql  


[1] https://docs.python.org/3.9/library/winreg.html#winreg.SetValueEx
