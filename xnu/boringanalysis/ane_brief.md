##0x01 [oops-i-missed-it-again](https://googleprojectzero.blogspot.com/2020/11/oops-i-missed-it-again.html)

概述: 低权限的`H11ANEInDirectPathClient::externalMethod`函数中，缺少正确的边界检查，使得可以调用高权限`H11ANEInUserClient`函数的external methods，是一个copy-paste问题

PJ0的这篇文章有点神奇，不是分析文章，更多的是一种絮絮叨叨的东西，不过对于入门来说会有比较多经验的传授  
文章作者Brandon Azad，ida_kernelcache的开发者   

开始主要讲到，作者找到个IOAccelCommandQueue2的漏洞，并写了exp。

> 一般，在已知漏洞的基础上，再挖新漏洞会比较简单  

开篇没几句，作者以及凡尔赛了自己写的两个exp：[CVE-2019-6225-voucher_swap](https://googleprojectzero.blogspot.com/2019/01/voucherswap-exploiting-mig-reference.html)、[CVE-2020-3837-OOB_timestamp](https://googleprojectzero.blogspot.com/2019/01/voucherswap-exploiting-mig-reference.html)，以及在遍历IOServices时，一不留神发现的[CVE-2020-3831](https://bugs.chromium.org/p/project-zero/issues/detail?id=2004)

```C
//一般fuzzer三步走
kern_return_t IOServiceGetMatchingServices(mach_port_t masterPort, CFDictionaryRef matching, io_iterator_t *existing);
kern_return_t IOServiceOpen(io_service_t service, task_port_t owningTask, uint32_t type, io_connect_t *connect);
kern_return_t IOConnectCallMethod(mach_port_t connection, uint32_t selector, const uint64_t *input, uint32_t inputCnt, const void *inputStruct, size_t inputStructCnt, uint64_t *output, uint32_t *outputCnt, void *outputStruct, size_t *outputStructCnt);
```

那么作者发现了H11ANEIn驱动的一个H11ANEInDirectPathClient可以reachable，这是怎么确定的？？？，从DATA_CONST.kmod_init段么？或者prelink_info？

有符号的话，容易确定;无符号，凭借关键字确定么？

```C
OSMetaClass *_GLOBAL__sub_I_H11ANEUserClient_cpp()
{
  OSMetaClass *result; // x0

  OSMetaClass::OSMetaClass(
    (OSMetaClass *)&H11ANEInUserClient::gMetaClass,
    "H11ANEInUserClient",
    &IOUserClient::gMetaClass,
    0x190u)->__vftable = (OSMetaClass_vtbl *)off_FFFFFFF0078A6C10;
  result = OSMetaClass::OSMetaClass(
             &H11ANEInDirectPathClient::gMetaClass,
             "H11ANEInDirectPathClient",
             &IOUserClient::gMetaClass,
             0x190u);
  result->__vftable = (OSMetaClass_vtbl *)off_FFFFFFF0078A7290;
  return result;
}

_QWORD *_DATA_CONST_InitFunc_706()
{
  _QWORD *result; // x0

  *(_QWORD *)sub_FFFFFFF0080B5504(&qword_FFFFFFF00942E7C8, "H11ANEInUserClient", &unk_FFFFFFF009421AD0, 400LL) = off_FFFFFFF007A3EAA0;
  result = (_QWORD *)sub_FFFFFFF0080B5504(
                       &qword_FFFFFFF00942E7F0,
                       "H11ANEInDirectPathClient",
                       &unk_FFFFFFF009421AD0,
                       400LL);
  *result = off_FFFFFFF007A3F120;
  return result;
}
```

驱动代码闭源，作者认为

> 和开源相比，闭源更会有一些很容易找到的漏洞

H11ANEIn有两个userclient：H11ANEInDirectPathClient与H11ANEInUserClient  
函数H11ANEIn::newUserClient中有字符串提示：

```C
    "%s : H11ANEIn::newUserClient : Creating direct evaluate client\n",
    "virtual IOReturn H11ANEIn::newUserClient(task_t, void *, UInt32, IOUserClient **)");
    v9 = (*(__int64 (**)(void))(H11ANEInDirectPathClient::gMetaClass + 0x68))();

    "%s : H11ANEIn::newUserClient : Creating default full-entitlement client\n",
    "virtual IOReturn H11ANEIn::newUserClient(task_t, void *, UInt32, IOUserClient **)");
    v11 = (*(__int64 (**)(void))(H11ANEInUserClient::gMetaClass + 0x68))();
```
所以看起来H11ANEInDirectPathClient的权限比H11ANEInUserClient要低，在H11ANEInUserClient::init的时候，也表明了需要com.apple.ane.iokit-user-access的Entitlement

```C
v7 = IOUserClient::copyClientEntitlement(a2, "com.apple.ane.iokit-user-access");
```

> 一般，找IOKit user clients的漏洞就是去找提供的external methods的漏洞。在user clients虚表附近会有函数指针表

```
FF007A3F198 off_FFFFFFF007A3F198 DCQ H11ANEInDirectPathClient__ANE_DeviceOpen_0
FF007A3F1B0                 DCQ sub_FFFFFFF0087187A0
FF007A3F1C8                 DCQ H11ANEInDirectPathClient___ANE_ProgramSendRequest
FF007A3F1E0 off_FFFFFFF007A3F1E0 DCQ sub_FFFFFFF008718944
FF007A3F1F8                 DCQ sub_FFFFFFF008718984
FF007A3F210                 DCQ sub_FFFFFFF008718988
FF007A3F228                 DCQ sub_FFFFFFF008718994
FF007A3F240                 DCQ sub_FFFFFFF008718A1C
FF007A3F258                 DCQ sub_FFFFFFF008718AA0
FF007A3F270                 DCQ sub_FFFFFFF008718AB8
FF007A3F288                 DCQ sub_FFFFFFF008718B18
FF007A3F2A0                 DCQ sub_FFFFFFF008718B1C
FF007A3F2B8                 DCQ j_H11ANEInUserClient__ANE_PowerOn
FF007A3F2D0                 DCQ j_H11ANEInUserClient__ANE_PowerOff
FF007A3F2E8                 DCQ sub_FFFFFFF008718B88
FF007A3F300                 DCQ sub_FFFFFFF008718B98
FF007A3F318                 DCQ sub_FFFFFFF008718BA4
FF007A3F330                 DCQ sub_FFFFFFF008718BF8
FF007A3F348                 DCQ sub_FFFFFFF008718C40
FF007A3F360                 DCQ sub_FFFFFFF008718C94
FF007A3F378                 DCQ sub_FFFFFFF008718CEC
FF007A3F390                 DCQ sub_FFFFFFF008718D44
FF007A3F3A8                 DCQ sub_FFFFFFF008718D50
FF007A3F3C0                 DCQ sub_FFFFFFF008718D98
FF007A3F3D8                 DCQ sub_FFFFFFF008718DA4
FF007A3F3F0                 DCQ sub_FFFFFFF008718DB8
FF007A3F408                 DCQ sub_FFFFFFF008718DCC
FF007A3F420                 DCQ sub_FFFFFFF008718E2C
FF007A3F438                 DCQ sub_FFFFFFF008718E4C
FF007A3F450                 DCQ sub_FFFFFFF008718E5C
FF007A3F468                 DCQ sub_FFFFFFF008718E74
FF007A3F480                 DCQ sub_FFFFFFF008718EE4
FF007A3F498                 DCQ sub_FFFFFFF008718F24
FF007A3F4B0                 DCQ sub_FFFFFFF008718F30
FF007A3F4C8                 DCQ sub_FFFFFFF008719130
```

感觉作者说了一大堆，核心就是上边的表以及下边的两个函数H11ANEInDirectPathClient::externalMethod以及H11ANEInUserClient::externalMethod  

```C
__int64 __fastcall sub_FFFFFFF008719470(__int64 a1, __int64 a2, __int64 a3, __int64 (__fastcall **a4)(), __int64 a5)
{
  __int64 v5; // x9

  if ( a5 )
    v5 = a5;
  else
    v5 = a1;
  if ( (unsigned int)a2 <= 0x21 )
    a5 = v5;
  if ( (unsigned int)a2 <= 0x21 )
    a4 = &off_FFFFFFF007A3F198 + 3 * (unsigned int)a2;
  return sub_FFFFFFF00815BD24(a1, a2, a3, a4, a5);
}

__int64 __fastcall sub_FFFFFFF0087199B0(__int64 a1, __int64 a2, __int64 a3, __int64 (__fastcall **a4)(), __int64 a5)
{
  __int64 v5; // x9

  if ( a5 )
    v5 = a5;
  else
    v5 = a1;
  if ( (unsigned int)a2 <= 0x21 )
    a5 = v5;
  if ( (unsigned int)a2 <= 0x21 )
    a4 = &off_FFFFFFF007A3F1E0 + 3 * (unsigned int)a2;
  return sub_FFFFFFF00815BD24(a1, a2, a3, a4, a5);
}
```

前边说到H11ANEInDirectPathClient的调用不需要额外的权限，而且只有三个methods，两个externalMethod函数其实都一样，H11ANEInDirectPathClient的selector被限定在0-33，可以直接调用H11ANEInUserClient的方法，导致越权。  

其实可以看下iOS 14 beta，有符号，而且已经被修复

```
08972B14 ; __int64 __fastcall H11ANEInDirectPathClient::externalMethod(H11ANEInDirectPathClient *__hidden this, unsigned int, IOExternalMethodArguments *, IOExternalMethodDispatch *, OSObject *, void *)
08972B14                 EXPORT __ZN24H11ANEInDirectPathClient14externalMethodEjP25IOExternalMethodArgumentsP24IOExternalMethodDispatchP8OSObjectPv
08972B14 __ZN24H11ANEInDirectPathClient14externalMethodEjP25IOExternalMethodArgumentsP24IOExternalMethodDispatchP8OSObjectPv
08972B14                                         ; DATA XREF: 71E0↑o
08972B14                 CMP             X4, #0
08972B18                 CCMP            W1, #3, #2, EQ
08972B1C                 ADRL            X8, __ZN24H11ANEInDirectPathClient8sMethodsE ; H11ANEInDirectPathClient::sMethods
08972B24                 MOV             W9, #0x18
08972B28                 UMADDL          X8, W1, W9, X8
08972B2C                 CSEL            X4, X0, X4, CC ; target
08972B30                 CMP             W1, #3
08972B34                 CSEL            X3, X8, X3, CC ; dispatch
08972B38                 ADRL            X8, __ZTV12IOUserClient ; `vtable for'IOUserClient
08972B40                 LDR             X6, [X8,#(__ZTV12IOUserClient.externalMethod - 0xFFFFFFF007724FA8)] ; `vtable for'IOUserClient
08972B44                 ADD             X7, X8, #0x550
08972B48                 MOVK            X7, #0xB352,LSL#48
08972B4C                 BRAA            X6, X7  ; IOUserClient::externalMethod(uint,IOExternalMethodArguments *,IOExternalMethodDispatch *,OSObject *,void *)
08972B4C ; End of function H11ANEInDirectPathClient::externalMethod(uint,IOExternalMethodArguments *,IOExternalMethodDispatch *,OSObject *,void *)
```

externalMethod中限定了H11ANEInDirectPathClient的调用方法范围

```C
//ios 14 beta4
__int64 __fastcall H11ANEInDirectPathClient::externalMethod(H11ANEInDirectPathClient *this, uint32_t a2, IOExternalMethodArguments *a3, IOExternalMethodDispatch *a4, OSObject *a5, void *a6)
{
  bool v6; // cf

  if ( a5 )
    v6 = 1;
  else
    v6 = a2 >= 3;
  if ( !v6 )
    a5 = (OSObject *)this;
  if ( a2 < 3 )
    a4 = (IOExternalMethodDispatch *)&H11ANEInDirectPathClient::sMethods[3 * a2];
  return IOUserClient::externalMethod((IOUserClient *)this, a2, a3, a4, a5, a6);
}

__int64 __fastcall H11ANEInUserClient::externalMethod(H11ANEInUserClient *this, uint32_t a2, IOExternalMethodArguments *a3, IOExternalMethodDispatch *a4, OSObject *a5, void *a6)
{
  bool v6; // cf

  if ( a5 )
    v6 = 1;
  else
    v6 = a2 >= 0x23;
  if ( !v6 )
    a5 = (OSObject *)this;
  if ( a2 < 0x23 )
    a4 = (IOExternalMethodDispatch *)(&H11ANEInUserClient::sMethods + 3 * a2);
  return IOUserClient::externalMethod((IOUserClient *)this, a2, a3, a4, a5, a6);
}
```

其实作者fuzz的时候以及发现了这个问题，调用到越界的methods导致后期的空指针，但是就算是作者当时意思到问题的根本原因，那最终到底能不能利用？  
作者还说在`H11ANEIn::ANE_ProgramSendRequest_gated()`中有一个越界读，`H11ANEInDirectPathClient::_ANE_ProgramSendRequest`会调用这个函数，但是，还是没见到具体的poc  

关于userclient以及externalMethod这部分原理性质的，需要重新总结一下

其实漏洞的根源在于copy-paste，那么这是不是又是函数相似性检测的问题了  

## 0x02 [Don’t place a port in shared memory](https://blog.pangu.io/?p=221)

作者直接去看了H11ANEInDirectPathClient的`_ANE_ProgramSendRequest`   

```C
__int64 __fastcall H11ANEInDirectPathClient::_ANE_ProgramSendRequest(H11ANEInDirectPathClient *this, H11ANEInDirectPathClient *a2, void *a3, IOExternalMethodArguments *a4)
{
  __int64 v4; // x19
  mach_vm_address_t *address; // x8
  IOMemoryDescriptor *v8; // x0
  IOMemoryDescriptor *v9; // x20
  __int64 v10; // x0
  __int64 v11; // x23
  __int64 v12; // x0

  v4 = 0xE00002BDLL;
  address = (mach_vm_address_t *)*((_QWORD *)a3 + 6);
  if ( address[1] != 0xA50 )
    return 0xE00002C2LL;
  v8 = IOMemoryDescriptor::withAddressRange(*address, 0xA50uLL, 0x20003u, *((task_t *)this + 0x1D));
  if ( v8 )
  {
    v9 = v8;
    if ( !((unsigned int (*)(void))v8->prepare)() )
    {
      //创建共享内存
      v10 = ((__int64 (__fastcall *)(IOMemoryDescriptor *, _QWORD))v9->map)(v9, 0LL);
      if ( v10 )
      {
        v11 = v10;
        v12 = (*(__int64 (**)(void))(*(_QWORD *)v10 + 120LL))();
        if ( v12 )
        {
          IOUserClient::setAsyncReference64(
            *((io_user_reference_t **)a3 + 2),
            *((mach_port_t *)a3 + 1),
            *(_QWORD *)(v12 + 2616),
            *(_QWORD *)(v12 + 2624));
          if ( *((_BYTE *)this + 225) )
            v4 = H11ANEIn::ANE_ProgramSendRequest(*((_QWORD *)this + 27));
          else
            v4 = 0xE00002CDLL;
        }
        (*(void (__fastcall **)(__int64))(*(_QWORD *)v11 + 40LL))(v11);
      }
      ((void (__fastcall *)(IOMemoryDescriptor *, __int64))v9->complete)(v9, 3LL);
    }
    ((void (__fastcall *)(IOMemoryDescriptor *))v9->release_0)(v9);
  }
  else
  {
    _os_log_internal(
      &_mh_execute_header,
      (os_log_t)&_os_log_default,
      OS_LOG_TYPE_DEFAULT,
      "%s ERROR:  - couldn't create memory descriptor\n",
      "static IOReturn H11ANEInDirectPathClient::_ANE_ProgramSendRequest(H11ANEInDirectPathClient *, void *, IOExternalMe"
      "thodArguments *)");
  }
  return v4;
}
```

那a3这个参数，是有合理性判断的，所以fuzz的话，是不是还是得需要手动辅助  
不得不提一句，这篇和上篇大都是在无符号的kc中做的逆向，这些结构体、函数啥的，必须熟悉才能。。。  
关键点来了，作者说  
IOConnectCallAsyncMethod能够调用`_ANE_ProgramSendRequest`。IOConnectCallAsyncMethod这个函数是不是从[in-wild-ios-exploit-chain-2](https://googleprojectzero.blogspot.com/2019/08/in-wild-ios-exploit-chain-2.html)来的？  

从用户态让IOKit扩展同步进程请求，通过wakeup port，当请求结束后，用户态程序会接收到通知。这就表明内核或者扩展会保存wakeup port，使得之后内核或者扩展可以发送通知
 
```C
//ios 13.3 iphone12.3
        v11 = (*(__int64 (**)(void))(*(_QWORD *)v9 + 120LL))();
        if ( v11 )
        {
          v12 = v11;
          v13 = (_OWORD *)(v11 + 2616);
          v14 = *(__int128 **)(a3 + 16);
          v15 = *v14;
          v16 = v14[1];
          v17 = v14[2];
          *(_OWORD *)(v12 + 2664) = v14[3];
          *(_OWORD *)(v12 + 2648) = v17;
          *(_OWORD *)(v12 + 2632) = v16;
          *v13 = v15;
          sub_FFFFFFF00815F920((int)v13, *(_QWORD *)(a3 + 8), *(_QWORD *)(v12 + 2680), *(_QWORD *)(v12 + 2688));
          if ( *(_BYTE *)(a1 + 225) )
            v3 = sub_FFFFFFF00871211C(*(_QWORD *)(a1 + 216), v12, 1LL, *(_QWORD *)(a1 + 232));
          else
            v3 = 3758097101LL;
        }

//ios14 beta4 

      v10 = ((__int64 (__fastcall *)(IOMemoryDescriptor *, _QWORD))v9->map)(v9, 0LL);
      if ( v10 )
      {
        v11 = v10;
        v12 = (*(__int64 (**)(void))(*(_QWORD *)v10 + 120LL))();
        if ( v12 )
        {
          IOUserClient::setAsyncReference64(
            *((io_user_reference_t **)a3 + 2),
            *((mach_port_t *)a3 + 1),
            *(_QWORD *)(v12 + 2616),
            *(_QWORD *)(v12 + 2624));
          if ( *((_BYTE *)this + 225) )
            v4 = H11ANEIn::ANE_ProgramSendRequest(*((_QWORD *)this + 27));
          else
            v4 = 0xE00002CDLL;
        }
```

a3这个结构体不清晰的话，还是没办法透彻的理解，在ios13.3中，v11就是共享内存的地址，偏移2616，也就是v13保存有port信息。既然是共享内存，那么是不是就可以泄露port地址

`H11ANEInDirectPathClient::ANE_DeviceOpen -> H11ANEIn::ANE_ProgramSendRequest -> H11ANEIn::ANE_ProgramSendRequest_gated`

第一步与第三步都需要一个id值，用来获取对应的buffer；id值来自于H11ANEInUserClient，但是这个在用户不能直接调用
最后作者只给了一条攻击链：

`app -> aned -> H11ANEInUserClient -> id`

针对port的一种攻击[Pangu jailbreak](https://googleprojectzero.blogspot.com/2018/10/deja-xnu.html)